pub const FACE_ML_VERSION: i64 = 1;
pub const CLIP_ML_VERSION: i64 = 1;
pub const PET_ML_VERSION: i64 = 1;

pub const CLIP_EMBEDDING_DIMENSIONS: usize = 512;
pub const CLIP_EMBEDDING_BYTES_LENGTH: i64 = CLIP_EMBEDDING_DIMENSIONS as i64 * 4;

pub const LAPLACIAN_HARD_THRESHOLD: f64 = 10.0;
pub const LAPLACIAN_SOFT_THRESHOLD: f64 = 50.0;
pub const LAPLACIAN_VERY_SOFT_THRESHOLD: f64 = 200.0;
pub const MINIMUM_QUALITY_FACE_SCORE: f64 = 0.80;
pub const MEDIUM_QUALITY_FACE_SCORE: f64 = 0.85;

pub const MAX_SQL_BIND_PARAMS_PER_QUERY: usize = 10000;

pub fn is_bad_face_for_clustering(face_score: f64, blur_value: f64, is_sideways: bool) -> bool {
    face_score < MINIMUM_QUALITY_FACE_SCORE
        || blur_value < LAPLACIAN_SOFT_THRESHOLD
        || (blur_value < LAPLACIAN_VERY_SOFT_THRESHOLD && face_score < MEDIUM_QUALITY_FACE_SCORE)
        || is_sideways
}
