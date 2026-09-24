import 'package:ente_ui/theme/ente_theme.dart';
import 'package:ente_ui/theme/theme_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class AccountAppBarLogo extends StatelessWidget {
  const AccountAppBarLogo({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = getEnteColorScheme(context);

    return SvgPicture.asset(
      'assets/svg/app-logo.svg',
      colorFilter: ColorFilter.mode(
        AppThemeConfig.currentApp == EnteApp.auth
            ? colors.textBase
            : colors.primary700,
        BlendMode.srcIn,
      ),
    );
  }
}
