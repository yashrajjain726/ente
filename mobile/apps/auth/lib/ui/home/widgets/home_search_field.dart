import 'package:flutter/material.dart';

/// Focuses the persistent search field and leaves the triggering key event for
/// the platform text input system to process.
bool activateHomeSearchFromKeyEvent({
  required VoidCallback showSearch,
  required FocusNode focusNode,
}) {
  showSearch();
  focusNode.requestFocus();
  FocusManager.instance.applyFocusChangesIfNeeded();
  return false;
}

/// Keeps the search input attached and programmatically focusable while hidden.
class PersistentSearchField extends StatelessWidget {
  const PersistentSearchField({
    super.key,
    required this.visible,
    required this.child,
  });

  final bool visible;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FocusTraversalGroup(
      descendantsAreTraversable: visible,
      child: Visibility(
        visible: visible,
        maintainState: true,
        maintainFocusability: true,
        child: child,
      ),
    );
  }
}
