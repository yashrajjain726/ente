/// Blur detection threshold
const kLaplacianHardThreshold = 10;
const kLaplacianSoftThreshold = 50;
const kLaplacianVerySoftThreshold = 200;

/// Default blur value
const kLapacianDefault = 10000.0;

/// The minimum score for a face to be detected, regardless of quality. Use [kMinimumQualityFaceScore] for high quality faces.
const kMinFaceDetectionScore = 0.5;

/// The minimum score for a face to be shown as detected in the UI
const kMinimumFaceShowScore = 0.75;

/// The minimum score for a face to be considered a high quality face for clustering and person detection
const kMinimumQualityFaceScore = 0.80;
const kMediumQualityFaceScore = 0.85;
const kHighQualityFaceScore = 0.90;

bool isBadFaceForClustering({
  required double faceScore,
  required double blurValue,
  required bool isSideways,
}) =>
    faceScore < kMinimumQualityFaceScore ||
    blurValue < kLaplacianSoftThreshold ||
    (blurValue < kLaplacianVerySoftThreshold &&
        faceScore < kMediumQualityFaceScore) ||
    isSideways;

/// The minimum cluster size for displaying a cluster in the UI by default
const kMinimumClusterSizeSearchResult = 10;

/// The minimum cluster size for displaying a cluster when the user wants to see all faces
const kMinimumClusterSizeAllFaces = 1;
