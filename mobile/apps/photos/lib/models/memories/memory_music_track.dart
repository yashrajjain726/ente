class MemoryMusicTrack {
  final String id;
  final MemoryMusicSource source;
  final String? title;
  final String? artist;

  const MemoryMusicTrack({
    required this.id,
    required this.source,
    this.title,
    this.artist,
  });
}

sealed class MemoryMusicSource {
  const MemoryMusicSource();
}

class AssetMemoryMusicSource extends MemoryMusicSource {
  final String assetPath;

  const AssetMemoryMusicSource(this.assetPath);
}
