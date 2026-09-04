#[derive(Clone, Debug, PartialEq)]
pub struct FaceRow {
    pub file_id: i64,
    pub face_id: String,
    pub detection_json: String,
    pub embedding: Vec<f64>,
    pub score: f64,
    pub blur: f64,
    pub is_sideways: bool,
    pub image_height: i64,
    pub image_width: i64,
    pub ml_version: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FaceWithoutEmbedding {
    pub face_id: String,
    pub file_id: i64,
    pub score: f64,
    pub detection_json: String,
    pub blur: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FaceDbInfoForClustering {
    pub face_id: String,
    pub cluster_id: Option<String>,
    pub embedding_bytes: Vec<u8>,
    pub face_score: f64,
    pub blur_value: f64,
    pub is_sideways: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetFaceRow {
    pub file_id: i64,
    pub pet_face_id: String,
    pub detection_json: String,
    pub face_vector_id: Option<i64>,
    pub species: i64,
    pub face_score: f64,
    pub image_height: i64,
    pub image_width: i64,
    pub ml_version: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetBodyRow {
    pub file_id: i64,
    pub pet_body_id: String,
    pub detection_json: String,
    pub body_vector_id: Option<i64>,
    pub species: i64,
    pub score: f64,
    pub image_height: i64,
    pub image_width: i64,
    pub ml_version: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetFaceVectorRow {
    pub pet_face_id: String,
    pub face_vector_id: Option<i64>,
    pub species: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetBodyVectorRow {
    pub pet_body_id: String,
    pub body_vector_id: Option<i64>,
    pub species: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetRowsForFiles {
    pub faces: Vec<PetFaceVectorRow>,
    pub bodies: Vec<PetBodyVectorRow>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClipEmbedding {
    pub file_id: i64,
    pub embedding: Vec<f64>,
    pub version: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EmbeddingVector {
    pub file_id: i64,
    pub embedding: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClipRow {
    pub file_id: i64,
    pub embedding: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClusterSummary {
    pub avg: Vec<u8>,
    pub count: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClusterCentroidRow {
    pub cluster_id: String,
    pub avg: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FdStatus {
    pub file_id: i64,
    pub user_id: i64,
    pub data_type: String,
    pub size: i64,
    pub object_id: Option<String>,
    pub object_nonce: Option<String>,
    pub updated_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewInfo {
    pub object_id: String,
    pub object_size: i64,
}
