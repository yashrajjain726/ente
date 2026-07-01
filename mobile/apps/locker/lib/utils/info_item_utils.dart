import 'package:ente_components/ente_components.dart';
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:locker/models/info/info_item.dart';

enum InfoIconColorRole { caution, purple, primary, warning }

class InfoIconConfig {
  final dynamic icon;
  final InfoIconColorRole colorRole;

  const InfoIconConfig({required this.icon, required this.colorRole});
}

class InfoItemUtils {
  // Centralized configuration - change icons and colors here only
  static const Map<InfoType, InfoIconConfig> _infoTypeConfigs = {
    InfoType.note: InfoIconConfig(
      icon: HugeIcons.strokeRoundedNote,
      colorRole: InfoIconColorRole.caution,
    ),
    InfoType.physicalRecord: InfoIconConfig(
      icon: HugeIcons.strokeRoundedBriefcase01,
      colorRole: InfoIconColorRole.purple,
    ),
    InfoType.accountCredential: InfoIconConfig(
      icon: HugeIcons.strokeRoundedLockPassword,
      colorRole: InfoIconColorRole.primary,
    ),
    InfoType.emergencyContact: InfoIconConfig(
      icon: HugeIcons.strokeRoundedContactBook,
      colorRole: InfoIconColorRole.warning,
    ),
  };

  static InfoIconConfig _getInfoConfig(InfoType type) {
    return _infoTypeConfigs[type] ?? _infoTypeConfigs[InfoType.note]!;
  }

  static Widget getInfoIcon(
    BuildContext context,
    InfoType type, {
    bool showBackground = true,
    double size = 24,
    Color? backgroundColor,
  }) {
    final colors = context.componentColors;
    final config = _getInfoConfig(type);
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

  static Color _foregroundColor(InfoIconColorRole role, ColorTokens colors) {
    return switch (role) {
      InfoIconColorRole.caution => colors.caution,
      InfoIconColorRole.purple => colors.purple,
      InfoIconColorRole.primary => colors.primary,
      InfoIconColorRole.warning => colors.warning,
    };
  }

  static Color _backgroundColor(InfoIconColorRole role, ColorTokens colors) {
    return switch (role) {
      InfoIconColorRole.caution => colors.cautionLight,
      InfoIconColorRole.purple => colors.purpleLight,
      InfoIconColorRole.primary => colors.primaryLight,
      InfoIconColorRole.warning => colors.warningLight,
    };
  }
}
