import 'package:ente_components/ente_components.dart';
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

enum FileIconColorRole { warning, green, primary, neutral }

class FileIconConfig {
  final dynamic icon;
  final Set<String> extensions;
  final FileIconColorRole colorRole;

  const FileIconConfig({
    required this.icon,
    required this.extensions,
    required this.colorRole,
  });
}

class FileIconUtils {
  // Centralized configuration - change icons and colors here only
  static const Map<String, FileIconConfig> _fileTypeConfigs = {
    'pdf': FileIconConfig(
      extensions: {'.pdf'},
      icon: HugeIcons.strokeRoundedFile01,
      colorRole: FileIconColorRole.warning,
    ),
    'image': FileIconConfig(
      extensions: {'.jpg', '.png', '.heic'},
      icon: HugeIcons.strokeRoundedImage01,
      colorRole: FileIconColorRole.green,
    ),
    'presentation': FileIconConfig(
      extensions: {'.pptx'},
      icon: HugeIcons.strokeRoundedPresentation01,
      colorRole: FileIconColorRole.primary,
    ),
    'spreadsheet': FileIconConfig(
      extensions: {'.xlsx'},
      icon: HugeIcons.strokeRoundedTable01,
      colorRole: FileIconColorRole.green,
    ),
  };

  static const FileIconConfig _defaultConfig = FileIconConfig(
    extensions: {},
    icon: HugeIcons.strokeRoundedFile02,
    colorRole: FileIconColorRole.neutral,
  );

  static FileIconConfig _getFileConfig(String fileName) {
    final lowerFileName = fileName.toLowerCase();
    final lastDotIndex = lowerFileName.lastIndexOf('.');

    if (lastDotIndex == -1) {
      return _defaultConfig; // No extension found
    }

    final extension = lowerFileName.substring(lastDotIndex);

    for (final config in _fileTypeConfigs.values) {
      if (config.extensions.contains(extension)) {
        return config;
      }
    }

    return _defaultConfig;
  }

  static Widget getFileIcon(
    BuildContext context,
    String fileName, {
    bool showBackground = true,
    double size = 24,
    Color? backgroundColor,
  }) {
    final colors = context.componentColors;
    final config = _getFileConfig(fileName);
    final foregroundColor = _foregroundColor(config.colorRole, colors);

    final icon = HugeIcon(
      icon: config.icon,
      color: foregroundColor,
      size: size,
    );

    if (!showBackground) {
      return icon;
    }

    return Container(
      decoration: BoxDecoration(
        color: backgroundColor ?? _backgroundColor(config.colorRole, colors),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(padding: const EdgeInsets.all(8.0), child: icon),
    );
  }

  static Color getFileIconColor(BuildContext context, String fileName) {
    return _foregroundColor(
      _getFileConfig(fileName).colorRole,
      context.componentColors,
    );
  }

  static Color getFileIconBackgroundColor(
    BuildContext context,
    String fileName,
  ) {
    return _backgroundColor(
      _getFileConfig(fileName).colorRole,
      context.componentColors,
    );
  }

  static Color _foregroundColor(FileIconColorRole role, ColorTokens colors) {
    return switch (role) {
      FileIconColorRole.warning => colors.warning,
      FileIconColorRole.green => colors.green,
      FileIconColorRole.primary => colors.primary,
      FileIconColorRole.neutral => colors.textLight,
    };
  }

  static Color _backgroundColor(FileIconColorRole role, ColorTokens colors) {
    return switch (role) {
      FileIconColorRole.warning => colors.warningLight,
      FileIconColorRole.green => colors.greenLight,
      FileIconColorRole.primary => colors.primaryLight,
      FileIconColorRole.neutral => colors.fillLight,
    };
  }
}
