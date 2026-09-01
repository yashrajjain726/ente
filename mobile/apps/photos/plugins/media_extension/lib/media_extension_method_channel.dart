import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:media_extension/media_extension_action_types.dart';
import 'package:media_extension/media_extension_platform_interface.dart';

/// An implementation of [MediaExtensionPlatform] that uses method channels.
class MethodChannelMediaExtension extends MediaExtensionPlatform {
  /// The method channel used to interact with the native platform.
  @visibleForTesting
  final methodChannel = const MethodChannel('media_extension');

  final _intentActionController =
      StreamController<MediaExtentionAction>.broadcast();
  bool _hasMethodCallHandler = false;

  void _ensureMethodCallHandler() {
    if (_hasMethodCallHandler) {
      return;
    }
    methodChannel.setMethodCallHandler((call) async {
      if (call.method != 'getIntentAction') {
        return;
      }
      _intentActionController.add(_parseIntentAction(call.arguments));
    });
    _hasMethodCallHandler = true;
  }

  MediaExtentionAction _parseIntentAction(dynamic args) {
    final map = args is Map ? args : const <String, dynamic>{};
    return MediaExtentionAction(
      action: actionParser(map['action'] as String? ?? ''),
      name: map['name'] as String?,
      type: mediaParser(map['type'] as String?),
      extension: map['extension'] as String?,
      data: map['data'] as String?,
      allowMultiple:
          map['allowMultiple'] == true ||
          map['allowMultiple']?.toString() == 'true',
    );
  }

  /// This Method retrivies the platform version from native thread.
  @override
  Future<String?> getPlatformVersion() async {
    final version = await methodChannel.invokeMethod<String>(
      'getPlatformVersion',
    );
    return version;
  }

  /// This Method sends the selected Image's [uri] to the native thread.
  /// from the Flutter thread to send results to apps
  /// which can handle [ACTION_ATTACH_DATA] Intent of [mimeType] `images/*`.
  @override
  Future<bool> setAs(
    String uri,
    String mimeType, {
    String title = 'Set as',
  }) async {
    try {
      final result = await methodChannel.invokeMethod(
        'setAs',
        <String, dynamic>{'uri': uri, 'mimeType': mimeType, 'title': title},
      );
      if (result != null) return result as bool;
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
    return false;
  }

  /// This Method sends the selected Image's [uri] to the native thread.
  /// from the Flutter thread to send results to apps
  /// which can handle [ACTION_EDIT] Intent of [mimeType] `images/*`.
  @override
  Future<bool> edit(
    String uri,
    String mimeType, {
    String title = 'Edit',
  }) async {
    try {
      final result = await methodChannel.invokeMethod('edit', <String, dynamic>{
        'uri': uri,
        'mimeType': mimeType,
        'title': title,
      });
      if (result != null) return result as bool;
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
    return false;
  }

  /// This Method sends the selected Image's [uri] to the native thread.
  /// from the Flutter thread to send results
  /// to apps which can handle [ACTION_VIEW] Intent of [mimeType] `images/*`.
  @override
  Future<bool> openWith(
    String uri,
    String mimeType, {
    String title = 'Open With',
  }) async {
    try {
      final result = await methodChannel.invokeMethod(
        'openWith',
        <String, dynamic>{'uri': uri, 'mimeType': mimeType, 'title': title},
      );
      if (result != null) return result as bool;
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
    return false;
  }

  /// This Method is triggered by the Native Thread which sends the [intentAction]
  /// and [uri] information in a [HashMap] Structure to the Flutter thread.
  @override
  Future<MediaExtentionAction> getIntentAction() async {
    _ensureMethodCallHandler();
    final args = await methodChannel.invokeMethod('getIntentAction');
    return _parseIntentAction(args);
  }

  @override
  Future<Uint8List?> readUriBytes(String uri) async {
    if (defaultTargetPlatform != TargetPlatform.android) {
      return null;
    }
    return methodChannel.invokeMethod<Uint8List>(
      'readUriBytes',
      <String, dynamic>{'uri': uri},
    );
  }

  @override
  Stream<MediaExtentionAction> get intentActionStream {
    _ensureMethodCallHandler();
    return _intentActionController.stream;
  }

  /// This Method sends the selected Image's [uri] to the native thread.
  /// from the Flutter thread to send results to the app
  /// which invoked our app using [ACTION_PICK] INTENT.
  @override
  Future<void> setResult(String uri) async {
    try {
      await methodChannel.invokeMethod('setResult', {'uri': uri});
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
  }

  /// This Method sends selected media [uris] to the native thread.
  /// from the Flutter thread to send results to the app
  /// which invoked our app using [ACTION_PICK] INTENT.
  @override
  Future<void> setResults(List<String> uris) async {
    try {
      await methodChannel.invokeMethod('setResults', {'uris': uris});
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
  }

  /// This Method cancels the result to the app
  /// which invoked our app using [ACTION_PICK] INTENT.
  @override
  Future<void> cancelResult() async {
    try {
      await methodChannel.invokeMethod('cancelResult');
    } on PlatformException catch (e) {
      debugPrint(e.message);
    }
  }
}
