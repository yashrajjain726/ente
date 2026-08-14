enum PreviewItemStatus {
  compressing,
  uploading,
  failed,
  inQueue,
  retry,
  uploaded,
  // paused (e.g., due to uploads in progress)
  paused,
}
