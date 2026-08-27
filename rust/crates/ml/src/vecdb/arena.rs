use std::collections::HashMap;

use wide::f32x8;

use super::VecDbError;
use super::kernel::{
    F32Kernel, LANE_WIDTH, VectorKernel, pack_lanes, pack_lanes_into, unpack_lanes,
};

pub(crate) const VECTORS_PER_CHUNK: usize = 4096;
pub(crate) const MAX_KEY_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum UpsertOutcome {
    NewSlot(u32),
    RecycledSlot(u32),
    ReplacedInPlace(u32),
}

#[allow(dead_code)]
impl UpsertOutcome {
    pub(crate) fn slot(self) -> u32 {
        match self {
            UpsertOutcome::NewSlot(slot)
            | UpsertOutcome::RecycledSlot(slot)
            | UpsertOutcome::ReplacedInPlace(slot) => slot,
        }
    }
}

pub(crate) fn validate_key(key: &str) -> Result<(), VecDbError> {
    if key.is_empty() {
        return Err(VecDbError::InvalidKey("key is empty".to_string()));
    }
    if key.len() > MAX_KEY_BYTES {
        return Err(VecDbError::InvalidKey(format!(
            "key is {} bytes, limit is {MAX_KEY_BYTES}",
            key.len()
        )));
    }
    Ok(())
}

pub(crate) struct VectorArena {
    dims: usize,
    lanes_per_vector: usize,
    chunks: Vec<Vec<f32x8>>,
    keys_to_slots: HashMap<Box<str>, u32>,
    slots_to_keys: Vec<Box<str>>,
    alive: Vec<u64>,
    free_slots: Vec<u32>,
    live_count: usize,
}

#[allow(dead_code)]
impl VectorArena {
    pub(crate) fn new(dims: usize) -> Result<Self, VecDbError> {
        if dims == 0 || !dims.is_multiple_of(LANE_WIDTH) {
            return Err(VecDbError::InvalidDimensions(dims));
        }
        Ok(Self {
            dims,
            lanes_per_vector: dims / LANE_WIDTH,
            chunks: Vec::new(),
            keys_to_slots: HashMap::new(),
            slots_to_keys: Vec::new(),
            alive: Vec::new(),
            free_slots: Vec::new(),
            live_count: 0,
        })
    }

    pub(crate) fn dims(&self) -> usize {
        self.dims
    }

    pub(crate) fn live_count(&self) -> usize {
        self.live_count
    }

    pub(crate) fn dead_count(&self) -> usize {
        self.free_slots.len()
    }

    pub(crate) fn slot_count(&self) -> usize {
        self.slots_to_keys.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.live_count == 0
    }

    pub(crate) fn upsert(
        &mut self,
        key: &str,
        vector: &[f32],
    ) -> Result<UpsertOutcome, VecDbError> {
        validate_key(key)?;
        if vector.len() != self.dims {
            return Err(VecDbError::DimensionMismatch {
                expected: self.dims,
                actual: vector.len(),
            });
        }
        if let Some(&slot) = self.keys_to_slots.get(key) {
            self.write_vector(slot, vector);
            return Ok(UpsertOutcome::ReplacedInPlace(slot));
        }
        if let Some(slot) = self.free_slots.pop() {
            self.slots_to_keys[slot as usize] = Box::from(key);
            self.keys_to_slots.insert(Box::from(key), slot);
            self.mark_alive(slot);
            self.live_count += 1;
            self.write_vector(slot, vector);
            return Ok(UpsertOutcome::RecycledSlot(slot));
        }
        let slot = self.slots_to_keys.len() as u32;
        if slot as usize == self.chunks.len() * VECTORS_PER_CHUNK {
            self.chunks
                .push(vec![f32x8::ZERO; VECTORS_PER_CHUNK * self.lanes_per_vector]);
        }
        if slot as usize / 64 == self.alive.len() {
            self.alive.push(0);
        }
        self.slots_to_keys.push(Box::from(key));
        self.keys_to_slots.insert(Box::from(key), slot);
        self.mark_alive(slot);
        self.live_count += 1;
        self.write_vector(slot, vector);
        Ok(UpsertOutcome::NewSlot(slot))
    }

    pub(crate) fn remove(&mut self, key: &str) -> Option<u32> {
        let slot = self.keys_to_slots.remove(key)?;
        self.mark_dead(slot);
        self.live_count -= 1;
        self.free_slots.push(slot);
        Some(slot)
    }

    pub(crate) fn slot_of_key(&self, key: &str) -> Option<u32> {
        self.keys_to_slots.get(key).copied()
    }

    pub(crate) fn key_of_slot(&self, slot: u32) -> Option<&str> {
        if self.is_alive(slot) {
            Some(&self.slots_to_keys[slot as usize])
        } else {
            None
        }
    }

    pub(crate) fn is_alive(&self, slot: u32) -> bool {
        self.alive
            .get(slot as usize / 64)
            .is_some_and(|word| word & (1u64 << (slot % 64)) != 0)
    }

    pub(crate) fn live_slots(&self) -> impl Iterator<Item = u32> {
        (0..self.slots_to_keys.len() as u32).filter(|slot| self.is_alive(*slot))
    }

    pub(crate) fn vector_lanes(&self, slot: u32) -> &[f32x8] {
        let start = (slot as usize % VECTORS_PER_CHUNK) * self.lanes_per_vector;
        &self.chunks[slot as usize / VECTORS_PER_CHUNK][start..start + self.lanes_per_vector]
    }

    pub(crate) fn vector_values(&self, slot: u32) -> Vec<f32> {
        unpack_lanes(self.vector_lanes(slot))
    }

    pub(crate) fn pack_query(&self, values: &[f32]) -> Result<Vec<f32x8>, VecDbError> {
        if values.len() != self.dims {
            return Err(VecDbError::DimensionMismatch {
                expected: self.dims,
                actual: values.len(),
            });
        }
        Ok(pack_lanes(values))
    }

    pub(crate) fn distance_between_slots(&self, a: u32, b: u32) -> f32 {
        F32Kernel::distance(self.vector_lanes(a), self.vector_lanes(b))
    }

    pub(crate) fn distance_to_query(&self, query: &[f32x8], slot: u32) -> f32 {
        F32Kernel::distance(query, self.vector_lanes(slot))
    }

    fn vector_lanes_mut(&mut self, slot: u32) -> &mut [f32x8] {
        let start = (slot as usize % VECTORS_PER_CHUNK) * self.lanes_per_vector;
        &mut self.chunks[slot as usize / VECTORS_PER_CHUNK][start..start + self.lanes_per_vector]
    }

    fn write_vector(&mut self, slot: u32, values: &[f32]) {
        pack_lanes_into(values, self.vector_lanes_mut(slot));
    }

    fn mark_alive(&mut self, slot: u32) {
        self.alive[slot as usize / 64] |= 1u64 << (slot % 64);
    }

    fn mark_dead(&mut self, slot: u32) {
        self.alive[slot as usize / 64] &= !(1u64 << (slot % 64));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn splitmix64(state: &mut u64) -> u64 {
        *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = *state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn seeded_vector(seed: u64, dims: usize) -> Vec<f32> {
        let mut state = seed;
        (0..dims)
            .map(|_| {
                let unit = (splitmix64(&mut state) >> 40) as f32 / (1u64 << 24) as f32;
                unit * 2.0 - 1.0
            })
            .collect()
    }

    fn basis_vector(dims: usize, axis: usize) -> Vec<f32> {
        let mut values = vec![0.0; dims];
        values[axis] = 1.0;
        values
    }

    fn arena_with_keys(dims: usize, keys: &[&str]) -> VectorArena {
        let mut arena = VectorArena::new(dims).unwrap();
        for (index, key) in keys.iter().enumerate() {
            arena
                .upsert(key, &seeded_vector(index as u64, dims))
                .unwrap();
        }
        arena
    }

    #[test]
    fn rejects_invalid_dimensions() {
        assert!(matches!(
            VectorArena::new(0),
            Err(VecDbError::InvalidDimensions(0))
        ));
        assert!(matches!(
            VectorArena::new(12),
            Err(VecDbError::InvalidDimensions(12))
        ));
        assert!(VectorArena::new(8).is_ok());
        assert!(VectorArena::new(512).is_ok());
    }

    #[test]
    fn rejects_invalid_keys() {
        let mut arena = VectorArena::new(8).unwrap();
        let vector = seeded_vector(1, 8);
        assert!(matches!(
            arena.upsert("", &vector),
            Err(VecDbError::InvalidKey(_))
        ));
        let at_limit = "k".repeat(256);
        assert!(arena.upsert(&at_limit, &vector).is_ok());
        let over_limit = "k".repeat(257);
        assert!(matches!(
            arena.upsert(&over_limit, &vector),
            Err(VecDbError::InvalidKey(_))
        ));
        let multibyte_over_limit = format!("{}é", "k".repeat(255));
        assert_eq!(multibyte_over_limit.len(), 257);
        assert!(matches!(
            arena.upsert(&multibyte_over_limit, &vector),
            Err(VecDbError::InvalidKey(_))
        ));
    }

    #[test]
    fn rejects_dimension_mismatch() {
        let mut arena = VectorArena::new(16).unwrap();
        assert!(matches!(
            arena.upsert("key", &seeded_vector(1, 8)),
            Err(VecDbError::DimensionMismatch {
                expected: 16,
                actual: 8
            })
        ));
        assert!(matches!(
            arena.pack_query(&seeded_vector(1, 24)),
            Err(VecDbError::DimensionMismatch {
                expected: 16,
                actual: 24
            })
        ));
    }

    #[test]
    fn assigns_slots_in_encounter_order() {
        let arena = arena_with_keys(8, &["a", "b", "c"]);
        assert_eq!(arena.slot_of_key("a"), Some(0));
        assert_eq!(arena.slot_of_key("b"), Some(1));
        assert_eq!(arena.slot_of_key("c"), Some(2));
    }

    #[test]
    fn upsert_replaces_in_place() {
        let mut arena = VectorArena::new(8).unwrap();
        let first = seeded_vector(1, 8);
        let second = seeded_vector(2, 8);
        assert_eq!(
            arena.upsert("key", &first).unwrap(),
            UpsertOutcome::NewSlot(0)
        );
        assert_eq!(
            arena.upsert("key", &second).unwrap(),
            UpsertOutcome::ReplacedInPlace(0)
        );
        assert_eq!(arena.vector_values(0), second);
        assert_eq!(arena.live_count(), 1);
        assert_eq!(arena.slot_count(), 1);
    }

    #[test]
    fn free_list_reuses_most_recently_freed_slot_first() {
        let mut arena = arena_with_keys(8, &["a", "b", "c"]);
        assert_eq!(arena.remove("a"), Some(0));
        assert_eq!(arena.remove("c"), Some(2));
        assert_eq!(
            arena.upsert("d", &seeded_vector(4, 8)).unwrap(),
            UpsertOutcome::RecycledSlot(2)
        );
        assert_eq!(
            arena.upsert("e", &seeded_vector(5, 8)).unwrap(),
            UpsertOutcome::RecycledSlot(0)
        );
        assert_eq!(
            arena.upsert("f", &seeded_vector(6, 8)).unwrap(),
            UpsertOutcome::NewSlot(3)
        );
    }

    #[test]
    fn remove_is_noop_for_absent_key() {
        let mut arena = arena_with_keys(8, &["a"]);
        assert_eq!(arena.remove("missing"), None);
        assert_eq!(arena.remove("a"), Some(0));
        assert_eq!(arena.remove("a"), None);
    }

    #[test]
    fn lookups_work_in_both_directions() {
        let mut arena = arena_with_keys(8, &["a", "b"]);
        assert_eq!(arena.slot_of_key("b"), Some(1));
        assert_eq!(arena.key_of_slot(1), Some("b"));
        assert!(arena.is_alive(1));
        arena.remove("b");
        assert_eq!(arena.slot_of_key("b"), None);
        assert_eq!(arena.key_of_slot(1), None);
        assert!(!arena.is_alive(1));
        assert_eq!(arena.key_of_slot(999), None);
        assert!(!arena.is_alive(999));
    }

    #[test]
    fn tracks_live_and_dead_counts() {
        let mut arena = arena_with_keys(8, &["a", "b", "c"]);
        assert_eq!(arena.live_count(), 3);
        assert_eq!(arena.dead_count(), 0);
        assert!(!arena.is_empty());
        arena.remove("b");
        assert_eq!(arena.live_count(), 2);
        assert_eq!(arena.dead_count(), 1);
        arena.upsert("d", &seeded_vector(9, 8)).unwrap();
        assert_eq!(arena.live_count(), 3);
        assert_eq!(arena.dead_count(), 0);
        assert_eq!(arena.live_slots().collect::<Vec<_>>(), vec![0, 1, 2]);
    }

    #[test]
    fn dead_slot_vectors_stay_readable_for_routing() {
        let mut arena = VectorArena::new(8).unwrap();
        let vector = seeded_vector(3, 8);
        arena.upsert("a", &vector).unwrap();
        arena.remove("a");
        assert_eq!(arena.vector_values(0), vector);
    }

    #[test]
    fn readding_a_removed_key_recycles_like_any_new_key() {
        let mut arena = arena_with_keys(8, &["a", "b"]);
        assert_eq!(arena.remove("a"), Some(0));
        let vector = seeded_vector(9, 8);
        assert_eq!(
            arena.upsert("a", &vector).unwrap(),
            UpsertOutcome::RecycledSlot(0)
        );
        assert_eq!(arena.key_of_slot(0), Some("a"));
        assert_eq!(arena.vector_values(0), vector);
        assert_eq!(arena.live_count(), 2);
        assert_eq!(arena.dead_count(), 0);
        assert_eq!(arena.remove("b"), Some(1));
        assert_eq!(
            arena.upsert("c", &seeded_vector(10, 8)).unwrap(),
            UpsertOutcome::RecycledSlot(1)
        );
        assert_eq!(
            arena.upsert("b", &seeded_vector(11, 8)).unwrap(),
            UpsertOutcome::NewSlot(2)
        );
    }

    #[test]
    fn identical_operation_sequences_assign_identical_slots() {
        let mut first = VectorArena::new(8).unwrap();
        let mut second = VectorArena::new(8).unwrap();
        let mut state = 42u64;
        let mut keys: Vec<String> = Vec::new();
        let mut removed: Vec<String> = Vec::new();
        let mut operations = Vec::new();
        for step in 0..2000 {
            let roll = splitmix64(&mut state);
            match roll % 4 {
                0 if !keys.is_empty() => {
                    let key = keys.remove(roll as usize % keys.len());
                    removed.push(key.clone());
                    operations.push((key, None));
                }
                1 if !removed.is_empty() => {
                    let key = removed.remove(roll as usize % removed.len());
                    keys.push(key.clone());
                    operations.push((key, Some(seeded_vector(roll, 8))));
                }
                _ => {
                    let key = format!("key-{step}");
                    keys.push(key.clone());
                    operations.push((key, Some(seeded_vector(roll, 8))));
                }
            }
        }
        for (key, vector) in &operations {
            match vector {
                Some(values) => {
                    let a = first.upsert(key, values).unwrap();
                    let b = second.upsert(key, values).unwrap();
                    assert_eq!(a, b);
                }
                None => assert_eq!(first.remove(key), second.remove(key)),
            }
        }
        assert_eq!(first.live_count(), second.live_count());
        assert_eq!(first.slot_count(), second.slot_count());
        for slot in first.live_slots() {
            assert_eq!(first.key_of_slot(slot), second.key_of_slot(slot));
            assert_eq!(first.vector_values(slot), second.vector_values(slot));
        }
    }

    #[test]
    fn grows_across_chunks_without_moving_existing_vectors() {
        let mut arena = VectorArena::new(8).unwrap();
        arena.upsert("key-0", &seeded_vector(0, 8)).unwrap();
        let first_vector_address = arena.vector_lanes(0).as_ptr() as usize;
        for index in 1..4100u64 {
            arena
                .upsert(&format!("key-{index}"), &seeded_vector(index, 8))
                .unwrap();
        }
        assert_eq!(arena.slot_count(), 4100);
        assert_eq!(arena.live_count(), 4100);
        assert_eq!(arena.chunks.len(), 2);
        assert_eq!(
            arena.vector_lanes(0).as_ptr() as usize,
            first_vector_address
        );
        assert_eq!(arena.slot_of_key("key-4099"), Some(4099));
        assert_eq!(arena.key_of_slot(4097), Some("key-4097"));
        assert_eq!(arena.vector_values(4099), seeded_vector(4099, 8));
    }

    #[test]
    fn every_slotted_vector_is_32_byte_aligned() {
        let mut arena = VectorArena::new(16).unwrap();
        for index in 0..4200u64 {
            arena
                .upsert(&format!("key-{index}"), &seeded_vector(index, 16))
                .unwrap();
        }
        for slot in arena.live_slots() {
            assert_eq!(arena.vector_lanes(slot).as_ptr() as usize % 32, 0);
        }
    }

    #[test]
    fn distances_use_the_kernel_metric() {
        let mut arena = VectorArena::new(16).unwrap();
        arena.upsert("x", &basis_vector(16, 0)).unwrap();
        arena.upsert("y", &basis_vector(16, 9)).unwrap();
        assert_eq!(arena.distance_between_slots(0, 0), 0.0);
        assert_eq!(arena.distance_between_slots(0, 1), 1.0);
        let query = arena.pack_query(&basis_vector(16, 0)).unwrap();
        assert_eq!(arena.distance_to_query(&query, 0), 0.0);
        assert_eq!(arena.distance_to_query(&query, 1), 1.0);
    }
}
