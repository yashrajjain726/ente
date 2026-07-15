import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:flutter/services.dart";

class LegacyCongratulationsPage extends StatelessWidget {
  const LegacyCongratulationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: false,
        child: Scaffold(
          body: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [colors.primary, const Color(0xFF0A4499)],
              ),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  const Spacer(flex: 2),
                  Image.asset(
                    "assets/legacy_kit_ducky.png",
                    package: "ente_legacy",
                    width: 210,
                  ),
                  const SizedBox(height: 36),
                  Text(
                    context.strings.congratulations,
                    textAlign: TextAlign.center,
                    style: TextStyles.display1.copyWith(
                      color: colors.specialWhite,
                    ),
                  ),
                  const SizedBox(height: Spacing.lg),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 42),
                    child: Text(
                      context.strings.legacyCongratulationsMessage,
                      textAlign: TextAlign.center,
                      style: TextStyles.body.copyWith(
                        color: colors.specialWhite,
                      ),
                    ),
                  ),
                  const Spacer(flex: 3),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      Spacing.xxl,
                      0,
                      Spacing.xxl,
                      Spacing.xxl,
                    ),
                    child: SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: Material(
                        color: colors.specialWhite,
                        borderRadius: Radii.buttonBorder,
                        child: InkWell(
                          borderRadius: Radii.buttonBorder,
                          onTap: () => Navigator.of(
                            context,
                          ).popUntil((route) => route.isFirst),
                          child: Center(
                            child: Text(
                              context.strings.saveToLocker,
                              style: TextStyles.body.copyWith(
                                color: const Color(0xFF101010),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
