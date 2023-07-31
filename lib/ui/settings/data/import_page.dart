import 'package:ente_auth/l10n/l10n.dart';
import 'package:ente_auth/theme/ente_theme.dart';
import 'package:ente_auth/ui/components/buttons/icon_button_widget.dart';
import 'package:ente_auth/ui/components/captioned_text_widget.dart';
import 'package:ente_auth/ui/components/divider_widget.dart';
import 'package:ente_auth/ui/components/menu_item_widget.dart';
import 'package:ente_auth/ui/components/title_bar_title_widget.dart';
import 'package:ente_auth/ui/components/title_bar_widget.dart';
import 'package:ente_auth/ui/settings/data/import/import_service.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

enum ImportType {
  plainText,
  encrypted,
  ravio,
}

class ImportCodePage extends StatelessWidget {
  late List<ImportType> importOptions = [
    ImportType.plainText,
    ImportType.encrypted,
    ImportType.ravio,
  ];

  ImportCodePage({super.key});

  String getTitle(BuildContext context, ImportType type) {
    switch (type) {
      case ImportType.plainText:
        return context.l10n.importTypePlainText;
      case ImportType.encrypted:
        return context.l10n.importTypeEnteEncrypted;
      case ImportType.ravio:
        return 'Ravio OTP';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Scaffold(
        body: CustomScrollView(
          primary: false,
          slivers: <Widget>[
            TitleBarWidget(
              flexibleSpaceTitle: TitleBarTitleWidget(
                title: context.l10n.importCodes,
              ),
              flexibleSpaceCaption: "Import source",
              actionIcons: [
                IconButtonWidget(
                  icon: Icons.close_outlined,
                  iconButtonType: IconButtonType.secondary,
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (delegateBuildContext, index) {
                  final type = importOptions[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    child: Column(
                      children: [
                        if (index == 0)
                          const SizedBox(
                            height: 24,
                          ),
                        MenuItemWidget(
                          captionedTextWidget: CaptionedTextWidget(
                            title: getTitle(context, type),
                          ),
                          alignCaptionedTextToLeft: true,
                          menuItemColor: getEnteColorScheme(context).fillFaint,
                          pressedColor: getEnteColorScheme(context).fillFaint,
                          trailingIcon: Icons.chevron_right_outlined,
                          isBottomBorderRadiusRemoved:
                              index != importOptions.length - 1,
                          isTopBorderRadiusRemoved: index != 0,
                          onTap: () async {
                            ImportService().initiateImport(context, type);
                            // routeToPage(context, ImportCodePage());
                            // _showImportInstructionDialog(context);
                          },
                        ),
                        if (index != importOptions.length - 1)
                          DividerWidget(
                            dividerType: DividerType.menu,
                            bgColor: getEnteColorScheme(context).fillFaint,
                          ),
                      ],
                    ),
                  );
                },
                childCount: importOptions.length,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
