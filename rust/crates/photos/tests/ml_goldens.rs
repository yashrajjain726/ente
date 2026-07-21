//! Manual (re)generation of the committed golden self-test data in
//! `src/ml/golden_data.rs`.
//!
//! `generate_goldens` is `#[ignore]`d; run it after a model update (or an
//! asset-lock change) to regenerate the file:
//!   cargo test -p ente-photos --features ml-assets --test ml_goldens -- --ignored generate_goldens
//!
//! CI does not run inference to validate the committed goldens; instead the
//! cheap `committed_goldens_are_pinned_to_the_production_models` unit test in
//! `golden_tooling` checks that every pinned production model in the asset
//! lock has a committed entry generated from the same content hash.

// The support module is shared with the ml_indexing test binary; parts unused
// by this binary are fine.
#[allow(dead_code)]
mod support;

use anyhow::{Context, bail};
use ente_photos::ml::golden_tooling::{
    GoldenMetric, GoldenModelSpec, GoldenSpecInput, render_golden_data,
};
use support::ml_indexing::{GoldenTestAssets, run_with_large_stack};

/// Fixed phrase for the CLIP text golden; tokenized with the production
/// tokenizer at generation time and committed as token ids.
const CLIP_TEXT_GOLDEN_PHRASE: &str = "a photo of a dog playing on a sunny beach";

fn production_model_specs(assets: &GoldenTestAssets) -> Vec<GoldenModelSpec> {
    // TODO: add the pet models here (and thereby to golden_data.rs) before
    // they are moved off CPU-only execution.
    vec![
        GoldenModelSpec {
            model_path: assets.face_detection.path.to_string_lossy().into_owned(),
            sha256: assets.face_detection.sha256.clone(),
            input: GoldenSpecInput::SeededNoise,
            // Validate confidence independently so large box and landmark
            // coordinates cannot hide score corruption.
            metric: GoldenMetric::DetectorRelativeL2 {
                row_len: 16,
                confidence_offset: 4,
            },
        },
        GoldenModelSpec {
            model_path: assets.face_embedding.path.to_string_lossy().into_owned(),
            sha256: assets.face_embedding.sha256.clone(),
            input: GoldenSpecInput::SeededNoise,
            metric: GoldenMetric::CosineDistance,
        },
        GoldenModelSpec {
            model_path: assets.clip_image.path.to_string_lossy().into_owned(),
            sha256: assets.clip_image.sha256.clone(),
            input: GoldenSpecInput::SeededNoise,
            metric: GoldenMetric::CosineDistance,
        },
        GoldenModelSpec {
            model_path: assets.clip_text.path.to_string_lossy().into_owned(),
            sha256: assets.clip_text.sha256.clone(),
            input: GoldenSpecInput::ClipText {
                phrase: CLIP_TEXT_GOLDEN_PHRASE.to_string(),
                vocab_path: assets.clip_text_vocab.to_string_lossy().into_owned(),
            },
            metric: GoldenMetric::CosineDistance,
        },
    ]
}

#[test]
#[ignore = "regenerates src/ml/golden_data.rs from the production models"]
fn generate_goldens() {
    run_with_large_stack("generate_goldens", || {
        let assets = GoldenTestAssets::load()?;
        let specs = production_model_specs(&assets);
        let source = render_golden_data(&specs)
            .map_err(|error| anyhow::anyhow!("generating goldens: {error}"))?;
        let path = GoldenTestAssets::golden_data_path()?;
        std::fs::write(&path, source).with_context(|| format!("write {}", path.display()))?;
        // Normalize to the repository's rustfmt style so the generated file
        // passes format checks without a manual step.
        let rustfmt = std::process::Command::new("rustfmt")
            .args(["--edition", "2024"])
            .arg(&path)
            .status()
            .with_context(|| format!("run rustfmt on {}", path.display()))?;
        if !rustfmt.success() {
            bail!("rustfmt failed on {}", path.display());
        }
        println!("wrote {}", path.display());
        Ok(())
    });
}
