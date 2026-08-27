class WrappedRootContactKey {
  final String encryptedKey;
  final String header;

  const WrappedRootContactKey({
    required this.encryptedKey,
    required this.header,
  });
}

class ContactOutput<T> {
  final T value;
  final WrappedRootContactKey? wrappedRootContactKey;

  const ContactOutput({
    required this.value,
    required this.wrappedRootContactKey,
  });
}
