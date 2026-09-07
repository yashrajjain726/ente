import "dart:math" as math;

import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/services/contacts/contact_identity_resolver.dart";
import "package:photos/ui/sharing/share_components.dart";
import "package:photos/ui/sharing/user_avator_widget.dart";
import "package:photos/ui/sharing/widgets/sharing_role.dart";

class ScrollableParticipantRoster extends StatefulWidget {
  const ScrollableParticipantRoster({super.key, required this.rows});

  final List<Widget> rows;

  @override
  State<ScrollableParticipantRoster> createState() =>
      _ScrollableParticipantRosterState();
}

class _ScrollableParticipantRosterState
    extends State<ScrollableParticipantRoster> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const maxVisibleRows = 3;
    final visibleRows = math.min(widget.rows.length, maxVisibleRows);
    final viewportHeight = _groupHeight(context, visibleRows);
    final showScrollbar = widget.rows.length > maxVisibleRows;
    final roster = ClipRRect(
      key: const ValueKey("participant-roster-clip"),
      borderRadius: BorderRadius.circular(Radii.button),
      child: SingleChildScrollView(
        key: const ValueKey("participant-roster-scroll"),
        controller: _scrollController,
        primary: false,
        child: ShareMenuGroup(items: widget.rows),
      ),
    );
    return SizedBox(
      height: viewportHeight,
      child: showScrollbar
          ? RawScrollbar(
              key: const ValueKey("participant-roster-scrollbar"),
              controller: _scrollController,
              thumbVisibility: true,
              trackVisibility: true,
              interactive: true,
              thickness: 5,
              radius: const Radius.circular(3),
              trackRadius: const Radius.circular(3),
              thumbColor: context.componentColors.fillDarkest,
              trackColor: context.componentColors.fillDark,
              padding: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: Spacing.sm + 5),
                child: roster,
              ),
            )
          : roster,
    );
  }

  double _groupHeight(BuildContext context, int itemCount) {
    const textStyle = TextStyles.body;
    final textExtent =
        MediaQuery.textScalerOf(context).scale(textStyle.fontSize!) *
        textStyle.height!;
    final rowExtent = math.max(60.0, textExtent + 20.0);
    return itemCount * rowExtent +
        (itemCount > 1 ? Spacing.sm * 2 : 0) +
        math.max(0, itemCount - 1) * Spacing.xs;
  }
}

class ParticipantRow extends StatelessWidget {
  const ParticipantRow({
    super.key,
    required this.user,
    required this.role,
    required this.currentUserID,
    this.trailing,
  });

  final User user;
  final CollectionParticipantRole role;
  final int currentUserID;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    return ShareMenuItem(
      title: user.id == currentUserID
          ? context.strings.you
          : resolveDisplayName(user),
      titleMaxLines: 1,
      leading: UserAvatarWidget(user, type: AvatarType.medium),
      trailing:
          trailing ??
          HugeIcon(
            icon: sharingRoleIcon(role),
            color: colors.textLightest,
            size: IconSizes.small,
            strokeWidth: 1.6,
          ),
      isDisabled: true,
    );
  }
}
