use wide::f32x8;

pub(crate) const LANE_WIDTH: usize = 8;

pub(crate) fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut mixed = *state;
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    mixed ^ (mixed >> 31)
}

pub(crate) trait VectorKernel {
    type Lane;

    fn dot(a: &[Self::Lane], b: &[Self::Lane]) -> f32;

    fn distance(a: &[Self::Lane], b: &[Self::Lane]) -> f32 {
        1.0 - Self::dot(a, b)
    }
}

pub(crate) struct F32Kernel;

impl VectorKernel for F32Kernel {
    type Lane = f32x8;

    fn dot(a: &[f32x8], b: &[f32x8]) -> f32 {
        debug_assert_eq!(a.len(), b.len());
        let mut acc = f32x8::ZERO;
        for (x, y) in a.iter().zip(b.iter()) {
            acc += *x * *y;
        }
        acc.to_array().iter().sum()
    }
}

pub(crate) fn pack_lanes(values: &[f32]) -> Vec<f32x8> {
    debug_assert_eq!(values.len() % LANE_WIDTH, 0);
    let mut lanes = vec![f32x8::ZERO; values.len() / LANE_WIDTH];
    pack_lanes_into(values, &mut lanes);
    lanes
}

pub(crate) fn pack_lanes_into(values: &[f32], lanes: &mut [f32x8]) {
    debug_assert_eq!(values.len(), lanes.len() * LANE_WIDTH);
    let (groups, remainder) = values.as_chunks::<LANE_WIDTH>();
    debug_assert!(remainder.is_empty());
    for (lane, group) in lanes.iter_mut().zip(groups) {
        *lane = f32x8::from(*group);
    }
}

pub(crate) fn unpack_lanes(lanes: &[f32x8]) -> Vec<f32> {
    let mut values = Vec::with_capacity(lanes.len() * LANE_WIDTH);
    for lane in lanes {
        values.extend_from_slice(&lane.to_array());
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_values(seed: u64, count: usize) -> Vec<f32> {
        let mut state = seed;
        (0..count)
            .map(|index| {
                let unit = (splitmix64(&mut state) >> 40) as f32 / (1u64 << 24) as f32;
                let signed = unit * 2.0 - 1.0;
                match index % 5 {
                    0 => signed * 1.0e6,
                    1 => signed * 1.0e-6,
                    _ => signed,
                }
            })
            .collect()
    }

    fn reference_dot(a: &[f32], b: &[f32]) -> f32 {
        let mut partials = [0.0f32; LANE_WIDTH];
        for (index, (x, y)) in a.iter().zip(b).enumerate() {
            partials[index % LANE_WIDTH] += x * y;
        }
        partials.iter().sum()
    }

    fn basis_vector(dims: usize, axis: usize) -> Vec<f32> {
        let mut values = vec![0.0; dims];
        values[axis] = 1.0;
        values
    }

    #[test]
    fn dot_matches_scalar_reference_bit_exactly() {
        for (dims, seed) in [(128, 11), (192, 22), (512, 33)] {
            let a = seeded_values(seed, dims);
            let b = seeded_values(seed.wrapping_mul(977), dims);
            let simd = F32Kernel::dot(&pack_lanes(&a), &pack_lanes(&b));
            let reference = reference_dot(&a, &b);
            assert!(reference.is_finite());
            assert_ne!(reference, 0.0);
            assert_eq!(simd.to_bits(), reference.to_bits());
        }
    }

    #[test]
    fn dot_handles_negative_values() {
        let a: Vec<f32> = (0..128)
            .map(|i| if i % 2 == 0 { -1.5 } else { 2.0 })
            .collect();
        let b: Vec<f32> = (0..128)
            .map(|i| if i % 3 == 0 { 0.25 } else { -4.0 })
            .collect();
        let simd = F32Kernel::dot(&pack_lanes(&a), &pack_lanes(&b));
        assert_eq!(simd.to_bits(), reference_dot(&a, &b).to_bits());
    }

    #[test]
    fn distance_is_one_minus_dot() {
        let a = seeded_values(7, 192);
        let b = seeded_values(13, 192);
        let lanes_a = pack_lanes(&a);
        let lanes_b = pack_lanes(&b);
        let expected = 1.0 - F32Kernel::dot(&lanes_a, &lanes_b);
        assert_eq!(
            F32Kernel::distance(&lanes_a, &lanes_b).to_bits(),
            expected.to_bits()
        );
    }

    #[test]
    fn distance_of_basis_vectors_is_exact() {
        let e0 = pack_lanes(&basis_vector(128, 0));
        let e1 = pack_lanes(&basis_vector(128, 100));
        assert_eq!(F32Kernel::distance(&e0, &e0), 0.0);
        assert_eq!(F32Kernel::distance(&e0, &e1), 1.0);
    }

    #[test]
    fn pack_unpack_round_trips() {
        let values = seeded_values(99, 512);
        let lanes = pack_lanes(&values);
        assert_eq!(lanes.len(), 64);
        assert_eq!(unpack_lanes(&lanes), values);
    }

    #[test]
    fn packed_lanes_are_32_byte_aligned() {
        assert_eq!(align_of::<f32x8>(), 32);
        for dims in [128, 192, 512] {
            let lanes = pack_lanes(&seeded_values(5, dims));
            assert_eq!(lanes.as_ptr() as usize % 32, 0);
        }
    }
}
