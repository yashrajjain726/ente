import "dart:convert";
import "dart:math";
import "dart:typed_data";

import "package:ente_crypto/ente_crypto.dart";
import "package:ente_frb/legacy.dart";
import "package:logging/logging.dart";
import "package:photos/core/configuration.dart";
import "package:photos/gateways/emergency/emergency_gateway.dart";
import "package:photos/gateways/users/models/key_attributes.dart";
import "package:photos/gateways/users/models/set_keys_request.dart";
import "package:photos/gateways/users/models/srp.dart";
import "package:photos/service_locator.dart";
import "package:pointycastle/pointycastle.dart";
import "package:pointycastle/random/fortuna_random.dart";
import "package:pointycastle/srp/srp6_client.dart";
import "package:pointycastle/srp/srp6_standard_groups.dart";
import "package:pointycastle/srp/srp6_util.dart";
import "package:pointycastle/srp/srp6_verifier_generator.dart";
import "package:uuid/uuid.dart";

class EmergencyContactService {
  late Configuration _config;
  late final Logger _logger = Logger("EmergencyContactService");

  EmergencyGateway get _gateway => emergencyGateway;

  EmergencyContactService._privateConstructor() {
    _config = Configuration.instance;
  }

  static final EmergencyContactService instance =
      EmergencyContactService._privateConstructor();

  Future<void> startRecovery(LegacyContactRecord contact) async {
    try {
      await _gateway.startRecovery(
        userID: contact.user.id,
        emergencyContactID: contact.emergencyContact.id,
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to start recovery', e, s);
      rethrow;
    }
  }

  Future<void> stopRecovery(LegacyRecoverySession session) async {
    try {
      await _gateway.stopRecovery(
        userID: session.user.id,
        emergencyContactID: session.emergencyContact.id,
        sessionID: session.id,
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to stop recovery', e, s);
      rethrow;
    }
  }

  Future<void> rejectRecovery(LegacyRecoverySession session) async {
    try {
      await _gateway.rejectRecovery(
        userID: session.user.id,
        emergencyContactID: session.emergencyContact.id,
        sessionID: session.id,
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to stop recovery', e, s);
      rethrow;
    }
  }

  Future<void> approveRecovery(LegacyRecoverySession session) async {
    try {
      await _gateway.approveRecovery(
        userID: session.user.id,
        emergencyContactID: session.emergencyContact.id,
        sessionID: session.id,
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to approve recovery', e, s);
      rethrow;
    }
  }

  Future<(String, KeyAttributes)> getRecoveryInfo(
    LegacyRecoverySession sessions,
  ) async {
    try {
      final (encryptedKey, keyAttributes) = await _gateway.getRecoveryInfo(
        sessions.id,
      );
      final decryptedKey = CryptoUtil.openSealSync(
        CryptoUtil.base642bin(encryptedKey),
        CryptoUtil.base642bin(_config.getKeyAttributes()!.publicKey),
        _config.getSecretKey()!,
      );
      final String hexRecoveryKey = CryptoUtil.bin2hex(decryptedKey);
      return (hexRecoveryKey, keyAttributes);
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to stop recovery', e, s);
      rethrow;
    }
  }

  Future<void> changePasswordForOther(
    Uint8List loginKey,
    SetKeysRequest setKeysRequest,
    LegacyRecoverySession recoverySessions,
  ) async {
    try {
      final SRP6GroupParameters kDefaultSrpGroup =
          SRP6StandardGroups.rfc5054_4096;
      final String username = const Uuid().v4().toString();
      final SecureRandom random = _getSecureRandom();
      final Uint8List identity = Uint8List.fromList(utf8.encode(username));
      final Uint8List password = loginKey;
      final Uint8List salt = random.nextBytes(16);
      final gen = SRP6VerifierGenerator(
        group: kDefaultSrpGroup,
        digest: Digest('SHA-256'),
      );
      final v = gen.generateVerifier(salt, identity, password);

      final client = SRP6Client(
        group: kDefaultSrpGroup,
        digest: Digest('SHA-256'),
        random: random,
      );

      final A = client.generateClientCredentials(salt, identity, password);
      final request = SetupSRPRequest(
        srpUserID: username,
        srpSalt: base64Encode(salt),
        srpVerifier: base64Encode(SRP6Util.encodeBigInt(v)),
        srpA: base64Encode(SRP6Util.getPadded(A!, 512)),
        isUpdate: false,
      );
      final setupSRPResponse = await _gateway.initPasswordChange(
        recoveryID: recoverySessions.id,
        setupSRPRequest: request,
      );
      final serverB = SRP6Util.decodeBigInt(
        base64Decode(setupSRPResponse.srpB),
      );

      // ignore: unused_local_variable
      final clientS = client.calculateSecret(serverB);
      final clientM = client.calculateClientEvidenceMessage();
      await _gateway.changePassword(
        recoveryID: recoverySessions.id,
        setupID: setupSRPResponse.setupID,
        srpM1: base64Encode(SRP6Util.getPadded(clientM!, 32)),
        updatedKeyAttr: setKeysRequest.toMap(),
      );
    } catch (e, s) {
      _logger.severe("failed to change password for other", e, s);
      rethrow;
    }
  }

  SecureRandom _getSecureRandom() {
    final List<int> seeds = [];
    final random = Random.secure();
    for (int i = 0; i < 32; i++) {
      seeds.add(random.nextInt(255));
    }
    final secureRandom = FortunaRandom();
    secureRandom.seed(KeyParameter(Uint8List.fromList(seeds)));
    return secureRandom;
  }
}
