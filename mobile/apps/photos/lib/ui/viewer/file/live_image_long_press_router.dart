enum MotionPhotoAvailability { unknown, absent, present }

enum LiveImageLongPressAction { playback, textSelection }

class LiveImageLongPressRouter {
  LiveImageLongPressRouter({
    required MotionPhotoAvailability initialAvailability,
    required Future<MotionPhotoAvailability> Function() probeMotionPhoto,
  }) : _availability = initialAvailability,
       _probeMotionPhoto = probeMotionPhoto;

  MotionPhotoAvailability _availability;
  final Future<MotionPhotoAvailability> Function() _probeMotionPhoto;

  Future<LiveImageLongPressAction> resolve() async {
    if (_availability == MotionPhotoAvailability.unknown) {
      final availability = await _probeMotionPhoto();
      if (availability != MotionPhotoAvailability.unknown) {
        _availability = availability;
      }
    }
    return _availability == MotionPhotoAvailability.present
        ? LiveImageLongPressAction.playback
        : LiveImageLongPressAction.textSelection;
  }
}
