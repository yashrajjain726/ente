String? trimToNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String? normalizeContactLinkEmail(String? email) {
  return trimToNull(email)?.toLowerCase();
}
