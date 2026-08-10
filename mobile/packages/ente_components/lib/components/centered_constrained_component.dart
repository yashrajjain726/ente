import 'package:flutter/widgets.dart';

/// A component that is horizontally centered and constrained to a maximum
/// width.
///
/// This component is useful for creating responsive layouts that look good on
/// both mobile and wider screens (tablets, desktop).
class CenteredConstrainedComponent extends StatelessWidget {
  const CenteredConstrainedComponent({
    required this.child,
    this.maxWidth = 700,
    super.key,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
