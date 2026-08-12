#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum Model {
    FaceDetection,
    FaceEmbedding,
    ClipImage,
    ClipText,
    PetFaceDetection,
    PetFaceEmbeddingDog,
    PetFaceEmbeddingCat,
    PetBodyDetection,
    PetBodyEmbeddingDog,
    PetBodyEmbeddingCat,
}

impl Model {
    pub(crate) const COUNT: usize = Self::PetBodyEmbeddingCat as usize + 1;

    pub(crate) const ALL: [Self; Self::COUNT] = [
        Self::FaceDetection,
        Self::FaceEmbedding,
        Self::ClipImage,
        Self::ClipText,
        Self::PetFaceDetection,
        Self::PetFaceEmbeddingDog,
        Self::PetFaceEmbeddingCat,
        Self::PetBodyDetection,
        Self::PetBodyEmbeddingDog,
        Self::PetBodyEmbeddingCat,
    ];

    pub(crate) const INDEXING: [Self; 9] = [
        Self::FaceDetection,
        Self::FaceEmbedding,
        Self::ClipImage,
        Self::PetFaceDetection,
        Self::PetFaceEmbeddingDog,
        Self::PetFaceEmbeddingCat,
        Self::PetBodyDetection,
        Self::PetBodyEmbeddingDog,
        Self::PetBodyEmbeddingCat,
    ];

    const INDEXING_PATH_VALIDATION: [Self; 9] = [
        Self::FaceDetection,
        Self::FaceEmbedding,
        Self::ClipImage,
        Self::PetFaceDetection,
        Self::PetBodyDetection,
        Self::PetFaceEmbeddingDog,
        Self::PetFaceEmbeddingCat,
        Self::PetBodyEmbeddingDog,
        Self::PetBodyEmbeddingCat,
    ];

    pub(crate) const fn index(self) -> usize {
        self as usize
    }

    pub(crate) const fn path_label(self) -> &'static str {
        match self {
            Self::FaceDetection => "faceDetectionModelPath",
            Self::FaceEmbedding => "faceEmbeddingModelPath",
            Self::ClipImage => "clipImageModelPath",
            Self::ClipText => "clipTextModelPath",
            Self::PetFaceDetection => "petFaceDetectionModelPath",
            Self::PetFaceEmbeddingDog => "petFaceEmbeddingDogModelPath",
            Self::PetFaceEmbeddingCat => "petFaceEmbeddingCatModelPath",
            Self::PetBodyDetection => "petBodyDetectionModelPath",
            Self::PetBodyEmbeddingDog => "petBodyEmbeddingDogModelPath",
            Self::PetBodyEmbeddingCat => "petBodyEmbeddingCatModelPath",
        }
    }

    pub(crate) const fn namespace(self) -> &'static str {
        match self {
            Self::FaceDetection => "face-detection",
            Self::FaceEmbedding => "face-embedding",
            Self::ClipImage => "clip-image",
            Self::ClipText => "clip-text",
            Self::PetFaceDetection => "pet-face-detection",
            Self::PetFaceEmbeddingDog => "pet-face-embedding-dog",
            Self::PetFaceEmbeddingCat => "pet-face-embedding-cat",
            Self::PetBodyDetection => "pet-body-detection",
            Self::PetBodyEmbeddingDog => "pet-body-embedding-dog",
            Self::PetBodyEmbeddingCat => "pet-body-embedding-cat",
        }
    }

    pub(crate) fn missing_path_error(self) -> String {
        let requirement = match self {
            Self::FaceDetection | Self::FaceEmbedding => " is required when runFaces is true",
            Self::ClipImage => " is required when runClip is true",
            Self::ClipText => " is required when running clip text",
            Self::PetFaceDetection | Self::PetBodyDetection => " is required when runPets is true",
            Self::PetFaceEmbeddingDog
            | Self::PetFaceEmbeddingCat
            | Self::PetBodyEmbeddingDog
            | Self::PetBodyEmbeddingCat => " is required",
        };
        format!("missing model path: {}{requirement}", self.path_label())
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModelPaths {
    pub face_detection: String,
    pub face_embedding: String,
    pub clip_image: String,
    pub clip_text: String,
    pub pet_face_detection: String,
    pub pet_face_embedding_dog: String,
    pub pet_face_embedding_cat: String,
    pub pet_body_detection: String,
    pub pet_body_embedding_dog: String,
    pub pet_body_embedding_cat: String,
}

impl ModelPaths {
    pub(crate) fn get(&self, model: Model) -> &str {
        match model {
            Model::FaceDetection => &self.face_detection,
            Model::FaceEmbedding => &self.face_embedding,
            Model::ClipImage => &self.clip_image,
            Model::ClipText => &self.clip_text,
            Model::PetFaceDetection => &self.pet_face_detection,
            Model::PetFaceEmbeddingDog => &self.pet_face_embedding_dog,
            Model::PetFaceEmbeddingCat => &self.pet_face_embedding_cat,
            Model::PetBodyDetection => &self.pet_body_detection,
            Model::PetBodyEmbeddingDog => &self.pet_body_embedding_dog,
            Model::PetBodyEmbeddingCat => &self.pet_body_embedding_cat,
        }
    }

    pub(crate) fn get_mut(&mut self, model: Model) -> &mut String {
        match model {
            Model::FaceDetection => &mut self.face_detection,
            Model::FaceEmbedding => &mut self.face_embedding,
            Model::ClipImage => &mut self.clip_image,
            Model::ClipText => &mut self.clip_text,
            Model::PetFaceDetection => &mut self.pet_face_detection,
            Model::PetFaceEmbeddingDog => &mut self.pet_face_embedding_dog,
            Model::PetFaceEmbeddingCat => &mut self.pet_face_embedding_cat,
            Model::PetBodyDetection => &mut self.pet_body_detection,
            Model::PetBodyEmbeddingDog => &mut self.pet_body_embedding_dog,
            Model::PetBodyEmbeddingCat => &mut self.pet_body_embedding_cat,
        }
    }
}

pub(crate) fn enabled_indexing_models(
    run_faces: bool,
    run_clip: bool,
    run_pets: bool,
) -> impl Iterator<Item = Model> {
    Model::INDEXING
        .into_iter()
        .filter(move |&model| indexing_model_is_enabled(model, run_faces, run_clip, run_pets))
}

pub(crate) fn required_indexing_models(
    run_faces: bool,
    run_clip: bool,
    run_pets: bool,
) -> impl Iterator<Item = Model> {
    Model::INDEXING_PATH_VALIDATION
        .into_iter()
        .filter(move |&model| indexing_model_is_enabled(model, run_faces, run_clip, run_pets))
}

fn indexing_model_is_enabled(
    model: Model,
    run_faces: bool,
    run_clip: bool,
    run_pets: bool,
) -> bool {
    match model {
        Model::FaceDetection | Model::FaceEmbedding => run_faces,
        Model::ClipImage => run_clip,
        Model::PetFaceDetection
        | Model::PetFaceEmbeddingDog
        | Model::PetFaceEmbeddingCat
        | Model::PetBodyDetection
        | Model::PetBodyEmbeddingDog
        | Model::PetBodyEmbeddingCat => run_pets,
        Model::ClipText => false,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn model_catalog_is_array_indexed_and_unique() {
        let mut path_labels = HashSet::new();
        let mut namespaces = HashSet::new();

        for (index, model) in Model::ALL.into_iter().enumerate() {
            assert_eq!(model.index(), index);
            assert!(path_labels.insert(model.path_label()));
            assert!(namespaces.insert(model.namespace()));
        }
    }

    #[test]
    fn model_paths_are_addressable_by_model() {
        let mut paths = ModelPaths::default();

        for model in Model::ALL {
            *paths.get_mut(model) = model.namespace().to_string();
        }

        for model in Model::ALL {
            assert_eq!(paths.get(model), model.namespace());
        }
    }

    #[test]
    fn indexing_catalog_contains_every_model_except_clip_text() {
        let indexes = Model::INDEXING
            .into_iter()
            .map(Model::index)
            .collect::<HashSet<_>>();

        assert_eq!(indexes.len(), Model::COUNT - 1);
        for model in Model::ALL {
            assert_eq!(indexes.contains(&model.index()), model != Model::ClipText);
        }
        assert_eq!(
            Model::INDEXING_PATH_VALIDATION
                .into_iter()
                .map(Model::index)
                .collect::<HashSet<_>>(),
            indexes
        );

        assert_eq!(
            enabled_indexing_models(true, false, false).collect::<Vec<_>>(),
            [Model::FaceDetection, Model::FaceEmbedding]
        );
        assert_eq!(
            enabled_indexing_models(false, true, false).collect::<Vec<_>>(),
            [Model::ClipImage]
        );
        assert_eq!(
            enabled_indexing_models(false, false, true).collect::<Vec<_>>(),
            [
                Model::PetFaceDetection,
                Model::PetFaceEmbeddingDog,
                Model::PetFaceEmbeddingCat,
                Model::PetBodyDetection,
                Model::PetBodyEmbeddingDog,
                Model::PetBodyEmbeddingCat,
            ]
        );
        assert_eq!(
            required_indexing_models(false, false, true).collect::<Vec<_>>(),
            [
                Model::PetFaceDetection,
                Model::PetBodyDetection,
                Model::PetFaceEmbeddingDog,
                Model::PetFaceEmbeddingCat,
                Model::PetBodyEmbeddingDog,
                Model::PetBodyEmbeddingCat,
            ]
        );
    }
}
