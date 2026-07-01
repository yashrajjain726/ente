import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";

class PopupMenuItemWidget extends StatelessWidget {
  final Widget icon;
  final String label;
  final bool isFirst;
  final bool isLast;
  final bool isWarning;
  final VoidCallback? onTap;

  const PopupMenuItemWidget({
    super.key,
    required this.icon,
    required this.label,
    this.isFirst = false,
    this.isLast = false,
    this.isWarning = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final bottomPadding = MediaQuery.of(context).viewPadding.bottom;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: colors.fillLight,
          border: !isLast
              ? Border(bottom: BorderSide(color: colors.strokeFaint, width: 1))
              : null,
          borderRadius: BorderRadius.only(
            topLeft: isFirst ? const Radius.circular(15) : Radius.zero,
            topRight: isFirst ? const Radius.circular(15) : Radius.zero,
            bottomLeft: isLast ? const Radius.circular(15) : Radius.zero,
            bottomRight: isLast ? const Radius.circular(15) : Radius.zero,
          ),
        ),
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: isLast ? 16 + bottomPadding : 16,
        ),
        child: Row(
          children: [
            icon,
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: isWarning
                    ? TextStyles.body.copyWith(color: colors.warning)
                    : TextStyles.body,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
