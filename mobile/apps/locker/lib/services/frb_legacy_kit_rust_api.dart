import "dart:typed_data";

import "package:ente_base/models/key_attributes.dart";
import "package:ente_contacts/contacts.dart" as contacts;
import "package:ente_legacy/models/legacy_kit_models.dart";
import "package:ente_legacy/services/legacy_kit_rust_api.dart";
import "package:locker/src/rust/api/legacy.dart" as rust;
import "package:locker/src/rust/api/session.dart" as rust_session;

class FrbLegacyKitRustApi implements LegacyKitRustApi {
  const FrbLegacyKitRustApi();

  @override
  Future<LegacyKitRustContext> open(
    contacts.ContactsSession session,
    Uint8List accountKey,
  ) async {
    final opened = rust_session.openSession(
      baseUrl: session.baseUrl,
      authToken: session.authToken,
      masterKey: accountKey,
      userAgent: session.userAgent,
      clientPackage: session.clientPackage,
      clientVersion: session.clientVersion,
    );
    return _FrbLegacyKitRustContext(opened);
  }
}

class _FrbLegacyKitRustContext implements LegacyKitRustContext {
  final rust_session.Session _session;

  const _FrbLegacyKitRustContext(this._session);

  @override
  Future<void> updateAuthToken(String authToken) {
    return _session.updateAuthToken(authToken: authToken);
  }

  @override
  Future<List<LegacyKit>> legacyKits() async {
    final kits = await _run(() => rust.kits(session: _session));
    return kits.map(_fromRustKit).toList(growable: false);
  }

  @override
  Future<LegacyKitCreateResult> legacyKitCreate({
    required KeyAttributes currentUserKeyAttrs,
    required List<String> partNames,
    required int noticePeriodInHours,
  }) async {
    final result = await _run(
      () => rust.createKit(
        session: _session,
        currentUserKeyAttrs: _toRustKeyAttributes(currentUserKeyAttrs),
        partNames: partNames,
        noticePeriodInHours: noticePeriodInHours,
      ),
    );
    return LegacyKitCreateResult(
      kit: _fromRustKit(result.kit),
      shares: result.shares.map(_fromRustShare).toList(growable: false),
    );
  }

  @override
  Future<List<LegacyKitShare>> legacyKitDownloadShares(String kitId) async {
    final shares = await _run(
      () => rust.downloadKitShares(session: _session, kitId: kitId),
    );
    return shares.map(_fromRustShare).toList(growable: false);
  }

  @override
  Future<LegacyKitOwnerRecoverySessionDetails> legacyKitRecoverySession(
    String kitId,
  ) async {
    final details = await _run(
      () => rust.kitRecoverySession(session: _session, kitId: kitId),
    );
    return LegacyKitOwnerRecoverySessionDetails(
      session: details.session == null
          ? null
          : _fromRustRecoverySession(details.session!),
      initiators: details.initiators
          .map(
            (hint) => LegacyKitRecoveryInitiatorHint(
              usedPartIndexes: hint.usedPartIndexes,
              ip: hint.ip,
              userAgent: hint.userAgent,
            ),
          )
          .toList(growable: false),
    );
  }

  @override
  Future<void> legacyKitUpdateRecoveryNotice({
    required String kitId,
    required int noticePeriodInHours,
  }) {
    return _run(
      () => rust.updateKitRecoveryNotice(
        session: _session,
        kitId: kitId,
        noticePeriodInHours: noticePeriodInHours,
      ),
    );
  }

  @override
  Future<void> legacyKitBlockRecovery(String kitId) {
    return _run(() => rust.blockKitRecovery(session: _session, kitId: kitId));
  }

  @override
  Future<void> legacyKitDelete(String kitId) {
    return _run(() => rust.deleteKit(session: _session, kitId: kitId));
  }
}

Future<T> _run<T>(Future<T> Function() action) async {
  try {
    return await action();
  } on rust.LegacyError_ActiveRecoverySession {
    throw LegacyKitActiveRecoverySessionException();
  }
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
