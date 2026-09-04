use super::error::{Error, Result};

const EVECTOR_VALUES_PACKED_TAG: u64 = 0x0A;
const EVECTOR_VALUES_FIXED64_TAG: u64 = 0x09;

pub fn encode_evector(values: &[f64]) -> Vec<u8> {
    if values.is_empty() {
        return Vec::new();
    }
    let mut bytes = Vec::with_capacity(values.len() * 8 + 10);
    bytes.push(EVECTOR_VALUES_PACKED_TAG as u8);
    push_varint(&mut bytes, (values.len() * 8) as u64);
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

pub fn decode_evector(bytes: &[u8]) -> Result<Vec<f64>> {
    let mut values = Vec::new();
    let mut offset = 0;
    while offset < bytes.len() {
        let tag = read_varint(bytes, &mut offset)?;
        match (tag, tag & 7) {
            (EVECTOR_VALUES_PACKED_TAG, _) => {
                let length = read_length(bytes, &mut offset)?;
                if length % 8 != 0 {
                    return Err(malformed());
                }
                for chunk in bytes[offset..offset + length].as_chunks::<8>().0 {
                    values.push(f64::from_le_bytes(*chunk));
                }
                offset += length;
            }
            (EVECTOR_VALUES_FIXED64_TAG, _) => {
                let end = advance(bytes, &mut offset, 8)?;
                values.push(f64_from_le(&bytes[end - 8..end]));
            }
            (_, 0) => {
                read_varint(bytes, &mut offset)?;
            }
            (_, 1) => {
                advance(bytes, &mut offset, 8)?;
            }
            (_, 2) => {
                let length = read_length(bytes, &mut offset)?;
                offset += length;
            }
            (_, 5) => {
                advance(bytes, &mut offset, 4)?;
            }
            _ => return Err(malformed()),
        }
    }
    Ok(values)
}

pub fn encode_f32(values: impl IntoIterator<Item = f32>) -> Vec<u8> {
    values
        .into_iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

pub fn decode_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|chunk| f32::from_le_bytes(*chunk))
        .collect()
}

fn f64_from_le(chunk: &[u8]) -> f64 {
    let mut buffer = [0u8; 8];
    buffer.copy_from_slice(chunk);
    f64::from_le_bytes(buffer)
}

fn push_varint(bytes: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        bytes.push((value as u8) | 0x80);
        value >>= 7;
    }
    bytes.push(value as u8);
}

fn read_varint(bytes: &[u8], offset: &mut usize) -> Result<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *bytes.get(*offset).ok_or_else(malformed)?;
        *offset += 1;
        value |= u64::from(byte & 0x7F) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err(malformed())
}

fn read_length(bytes: &[u8], offset: &mut usize) -> Result<usize> {
    let length = usize::try_from(read_varint(bytes, offset)?).map_err(|_| malformed())?;
    if bytes.len() - *offset < length {
        return Err(malformed());
    }
    Ok(length)
}

fn advance(bytes: &[u8], offset: &mut usize, count: usize) -> Result<usize> {
    if bytes.len() - *offset < count {
        return Err(malformed());
    }
    *offset += count;
    Ok(*offset)
}

fn malformed() -> Error {
    Error::Codec("malformed EVector bytes".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evector_matches_protobuf_packed_encoding() {
        let bytes = encode_evector(&[1.0, 2.0]);
        assert_eq!(
            bytes,
            [
                0x0A, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x40
            ]
        );
        assert_eq!(decode_evector(&bytes).unwrap(), vec![1.0, 2.0]);
    }

    #[test]
    fn empty_evector_is_zero_bytes() {
        assert!(encode_evector(&[]).is_empty());
        assert!(decode_evector(&[]).unwrap().is_empty());
    }

    #[test]
    fn evector_round_trips_long_vectors() {
        let values: Vec<f64> = (0..192).map(|i| i as f64 * 0.25 - 3.0).collect();
        let bytes = encode_evector(&values);
        assert_eq!(bytes[0], 0x0A);
        assert_eq!(&bytes[1..3], &[0x80, 0x0C]);
        assert_eq!(decode_evector(&bytes).unwrap(), values);
    }

    #[test]
    fn evector_accepts_unpacked_and_unknown_fields() {
        let mut bytes = vec![0x09];
        bytes.extend_from_slice(&3.5f64.to_le_bytes());
        bytes.extend_from_slice(&[0x10, 0x05]);
        bytes.extend_from_slice(&[0x1A, 0x02, 0xAA, 0xBB]);
        bytes.extend_from_slice(&[0x25, 1, 2, 3, 4]);
        bytes.extend_from_slice(&[0x09]);
        bytes.extend_from_slice(&(-1.0f64).to_le_bytes());
        assert_eq!(decode_evector(&bytes).unwrap(), vec![3.5, -1.0]);
    }

    #[test]
    fn evector_rejects_truncated_bytes() {
        assert!(decode_evector(&[0x0A, 0x10, 0x00]).is_err());
        assert!(decode_evector(&[0x0A, 0x04, 0, 0, 0, 0]).is_err());
        assert!(decode_evector(&[0x0F]).is_err());
    }

    #[test]
    fn f32_matches_little_endian_layout() {
        assert_eq!(encode_f32([1.0f32]), [0x00, 0x00, 0x80, 0x3F]);
        assert_eq!(decode_f32(&[0x00, 0x00, 0x80, 0x3F]), vec![1.0f32]);
        assert!(encode_f32([]).is_empty());
        assert!(decode_f32(&[]).is_empty());
    }

    #[test]
    fn f32_round_trips_and_ignores_trailing_bytes() {
        let values = vec![0.5f32, -2.25, 1e-7];
        let mut bytes = encode_f32(values.iter().copied());
        assert_eq!(decode_f32(&bytes), values);
        bytes.push(0xFF);
        assert_eq!(decode_f32(&bytes), values);
    }
}
