import 'package:ente_components/ente_components.dart';
import 'package:flutter/material.dart';

class FamilyPageScaffold extends StatelessWidget {
  const FamilyPageScaffold({
    required this.child,
    this.title,
    this.actions = const [],
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 16),
    super.key,
  });

  final Widget child;
  final String? title;
  final List<Widget> actions;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final backgroundColor = context.componentColors.backgroundBase;
    if (title != null) {
      return Scaffold(
        backgroundColor: backgroundColor,
        body: AppBarComponent(
          title: title!,
          actions: actions,
          backgroundColor: backgroundColor,
          slivers: [
            SliverPadding(
              padding: padding,
              sliver: SliverToBoxAdapter(child: child),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: backgroundColor,
      body: SafeArea(
        child: Padding(
          padding: padding,
          child: Column(
            children: [
              Row(
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => Navigator.of(context).pop(),
                    child: SizedBox(
                      width: 32,
                      height: 32,
                      child: Icon(
                        Icons.arrow_back,
                        size: 24,
                        color: context.componentColors.textBase,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

Future<bool> showFamilyConfirmationSheet(
  BuildContext context, {
  required String title,
  required String body,
  required String actionLabel,
}) async {
  final confirmed = await showBottomSheetComponent<bool>(
    context: context,
    builder: (sheetContext) => BottomSheetComponent(
      title: title,
      message: body,
      actions: [
        ButtonComponent(
          label: actionLabel,
          variant: ButtonComponentVariant.critical,
          shouldSurfaceExecutionStates: false,
          onTap: () => Navigator.of(sheetContext).pop(true),
        ),
      ],
    ),
  );

  return confirmed == true;
}
