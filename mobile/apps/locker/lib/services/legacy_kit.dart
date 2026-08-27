import 'package:ente_base/models/key_attributes.dart';
import 'package:ente_legacy/errors.dart';
import 'package:ente_legacy/models/legacy_kit_models.dart';
import 'package:locker/src/rust/api/legacy.dart' as rust;
import 'package:locker/src/rust/third_party/ente_frb_lib/session.dart';

Future<List<LegacyKit>> getLegacyKits(Session session) async {
  final kits = await rust.kits(session: session);
  return kits.map(_fromRustKit).toList(growable: false);
}

Future<LegacyKitCreateResult> createLegacyKit(
  Session session,
  KeyAttributes currentUserKeyAttrs,
  List<String> partNames,
  int noticePeriodInHours,
) async {
  final result = await rust.createKit(
    session: session,
    currentUserKeyAttrs: _toRustKeyAttributes(currentUserKeyAttrs),
    partNames: partNames,
    noticePeriodInHours: noticePeriodInHours,
  );
  return LegacyKitCreateResult(
    kit: _fromRustKit(result.kit),
    shares: result.shares.map(_fromRustShare).toList(growable: false),
  );
}

Future<List<LegacyKitShare>> downloadLegacyKitShares(
  Session session,
  String kitId,
) async {
  final shares = await rust.downloadKitShares(session: session, kitId: kitId);
  return shares.map(_fromRustShare).toList(growable: false);
}

Future<void> updateLegacyKitRecoveryNotice(
  Session session,
  String kitId,
  int noticePeriodInHours,
) async {
  try {
    await rust.updateKitRecoveryNotice(
      session: session,
      kitId: kitId,
      noticePeriodInHours: noticePeriodInHours,
    );
  } on rust.LegacyError_ActiveRecoverySession {
    throw LegacyKitActiveRecoverySessionException();
  }
}

Future<void> blockLegacyKitRecovery(Session session, String kitId) async {
  await rust.blockKitRecovery(session: session, kitId: kitId);
}

Future<void> deleteLegacyKit(Session session, String kitId) async {
  await rust.deleteKit(session: session, kitId: kitId);
}

rust.AccountKeyAttributes _toRustKeyAttributes(KeyAttributes attributes) {
  return rust.AccountKeyAttributes(
    kekSalt: attributes.kekSalt,
    encryptedKey: attributes.encryptedKey,
    keyDecryptionNonce: attributes.keyDecryptionNonce,
    publicKey: attributes.publicKey,
    encryptedSecretKey: attributes.encryptedSecretKey,
    secretKeyDecryptionNonce: attributes.secretKeyDecryptionNonce,
    memLimit: attributes.memLimit,
    opsLimit: attributes.opsLimit,
    masterKeyEncryptedWithRecoveryKey:
        attributes.masterKeyEncryptedWithRecoveryKey,
    masterKeyDecryptionNonce: attributes.masterKeyDecryptionNonce,
    recoveryKeyEncryptedWithMasterKey:
        attributes.recoveryKeyEncryptedWithMasterKey,
    recoveryKeyDecryptionNonce: attributes.recoveryKeyDecryptionNonce,
  );
}

LegacyKit _fromRustKit(rust.LegacyKit kit) {
  return LegacyKit(
    id: kit.id,
    noticePeriodInHours: kit.noticePeriodInHours,
    legacyUrl: kit.legacyUrl,
    parts: kit.metadata.parts
        .map((part) => LegacyKitPart(index: part.index, name: part.name))
        .toList(growable: false),
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
    activeRecoverySession: kit.activeRecoverySession == null
        ? null
        : _fromRustRecoverySession(kit.activeRecoverySession!),
  );
}

LegacyKitRecoverySession _fromRustRecoverySession(
  rust.LegacyKitRecoverySession session,
) {
  return LegacyKitRecoverySession(
    id: session.id,
    kitId: session.kitId,
    status: switch (session.status) {
      rust.LegacyKitRecoveryStatus.waiting => LegacyKitRecoveryStatus.waiting,
      rust.LegacyKitRecoveryStatus.ready => LegacyKitRecoveryStatus.ready,
      rust.LegacyKitRecoveryStatus.blocked => LegacyKitRecoveryStatus.blocked,
      rust.LegacyKitRecoveryStatus.cancelled =>
        LegacyKitRecoveryStatus.cancelled,
      rust.LegacyKitRecoveryStatus.recovered =>
        LegacyKitRecoveryStatus.recovered,
    },
    waitTill: session.waitTill,
    createdAt: session.createdAt,
  );
}

LegacyKitShare _fromRustShare(rust.LegacyKitShare share) {
  return LegacyKitShare(
    payloadVersion: share.payloadVersion,
    variant: switch (share.variant) {
      rust.LegacyKitVariant.twoOfThree => 1,
    },
    kitId: share.kitId,
    shareIndex: share.shareIndex,
    share: share.share,
    checksum: share.checksum,
    partName: share.partName,
  );
}
