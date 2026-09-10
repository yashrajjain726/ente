import "dart:convert";
import "dart:math";
import "dart:typed_data";

import "package:dio/dio.dart";
import "package:ente_accounts/models/set_keys_request.dart";
import "package:ente_accounts/models/srp.dart";
import "package:ente_base/models/key_attributes.dart";
import "package:ente_configuration/base_configuration.dart";
import "package:ente_crypto_api/ente_crypto_api.dart";
import "package:ente_frb/legacy.dart";
import "package:ente_network/network.dart";
import "package:logging/logging.dart";
import "package:pointycastle/pointycastle.dart";
import "package:pointycastle/random/fortuna_random.dart";
import "package:pointycastle/srp/srp6_client.dart";
import "package:pointycastle/srp/srp6_standard_groups.dart";
import "package:pointycastle/srp/srp6_util.dart";
import "package:pointycastle/srp/srp6_verifier_generator.dart";
import "package:uuid/uuid.dart";

class EmergencyContactService {
  final Dio _enteDio = Network.instance.enteDio;
  late BaseConfiguration _config;
  late final Logger _logger = Logger("EmergencyContactService");

  EmergencyContactService._privateConstructor();
  static final EmergencyContactService instance =
      EmergencyContactService._privateConstructor();

  void init(BaseConfiguration config) {
    _config = config;
  }

  Future<void> startRecovery(LegacyContactRecord contact) async {
    try {
      await _enteDio.post(
        "/emergency-contacts/start-recovery",
        data: {
          "userID": contact.user.id,
          "emergencyContactID": contact.emergencyContact.id,
        },
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to start recovery', e, s);
      rethrow;
    }
  }

  Future<void> stopRecovery(LegacyRecoverySession session) async {
    try {
      await _enteDio.post(
        "/emergency-contacts/stop-recovery",
        data: {
          "userID": session.user.id,
          "emergencyContactID": session.emergencyContact.id,
          "id": session.id,
        },
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to stop recovery', e, s);
      rethrow;
    }
  }

  Future<void> rejectRecovery(LegacyRecoverySession session) async {
    try {
      await _enteDio.post(
        "/emergency-contacts/reject-recovery",
        data: {
          "userID": session.user.id,
          "emergencyContactID": session.emergencyContact.id,
          "id": session.id,
        },
      );
    } catch (e, s) {
      Logger("EmergencyContact").severe('failed to stop recovery', e, s);
      rethrow;
    }
  }

  Future<void> approveRecovery(LegacyRecoverySession session) async {
    try {
      await _enteDio.post(
        "/emergency-contacts/approve-recovery",
        data: {
          "userID": session.user.id,
          "emergencyContactID": session.emergencyContact.id,
          "id": session.id,
        },
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
      final resp = await _enteDio.get(
        "/emergency-contacts/recovery-info/${sessions.id}",
      );
      final String encryptedKey = resp.data["encryptedKey"]!;
      final decryptedKey = CryptoUtil.openSealSync(
        CryptoUtil.base642bin(encryptedKey),
        CryptoUtil.base642bin(_config.getKeyAttributes()!.publicKey),
        _config.getSecretKey()!,
      );
      final String hexRecoveryKey = CryptoUtil.bin2hex(decryptedKey);
      final KeyAttributes keyAttributes = KeyAttributes.fromMap(
        resp.data['userKeyAttr'],
      );
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
      final response = await _enteDio.post(
        "/emergency-contacts/init-change-password",
        data: {
          "recoveryID": recoverySessions.id,
          "setupSRPRequest": request.toMap(),
        },
      );
      if (response.statusCode == 200) {
        final SetupSRPResponse setupSRPResponse = SetupSRPResponse.fromJson(
          response.data,
        );
        final serverB = SRP6Util.decodeBigInt(
          base64Decode(setupSRPResponse.srpB),
        );

        // ignore: unused_local_variable
        final clientS = client.calculateSecret(serverB);
        final clientM = client.calculateClientEvidenceMessage();
        // ignore: unused_local_variable
        late Response srpCompleteResponse;
        srpCompleteResponse = await _enteDio.post(
          "/emergency-contacts/change-password",
          data: {
            "recoveryID": recoverySessions.id,
            'updateSrpAndKeysRequest': {
              'setupID': setupSRPResponse.setupID,
              'srpM1': base64Encode(SRP6Util.getPadded(clientM!, 32)),
              'updatedKeyAttr': setKeysRequest.toMap(),
            },
          },
        );
      } else {
        throw Exception("register-srp action failed");
      }
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
