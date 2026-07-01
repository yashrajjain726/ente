import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:locker/l10n/l10n.dart";
import "package:locker/services/collections/models/collection.dart";
import "package:locker/services/collections/models/collection_view_type.dart";
import "package:locker/services/configuration.dart";
import "package:locker/ui/components/popup_menu_item_widget.dart";
import "package:locker/utils/collection_actions.dart";

class CollectionPopupMenuWidget extends StatelessWidget {
  final Collection collection;
  final Widget? child;

  const CollectionPopupMenuWidget({
    super.key,
    required this.collection,
    this.child,
  });

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;

    return PopupMenuButton<String>(
      onSelected: (value) => _handleMenuAction(context, value),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: colors.strokeFaint),
      ),
      padding: EdgeInsets.zero,
      menuPadding: EdgeInsets.zero,
      color: colors.fillLight,
      surfaceTintColor: Colors.transparent,
      elevation: 15,
      offset: const Offset(-24, 24),
      shadowColor: colors.specialScrim.withValues(alpha: 0.08),
      constraints: const BoxConstraints(minWidth: 120),
      child:
          child ??
          HugeIcon(
            icon: HugeIcons.strokeRoundedMoreVertical,
            color: colors.textBase,
          ),
      itemBuilder: (BuildContext context) {
        return _buildPopupMenuItems(context);
      },
    );
  }

  List<PopupMenuItem<String>> _buildPopupMenuItems(BuildContext context) {
    final colors = context.componentColors;

    final collectionViewType = getCollectionViewType(
      collection,
      Configuration.instance.getUserID()!,
    );

    final items = <PopupMenuItem<String>>[];

    if (collectionViewType == CollectionViewType.ownedCollection ||
        collectionViewType == CollectionViewType.hiddenOwnedCollection ||
        collectionViewType == CollectionViewType.quickLink) {
      items.add(
        PopupMenuItem<String>(
          value: 'edit',
          padding: EdgeInsets.zero,
          height: 0,
          child: PopupMenuItemWidget(
            icon: HugeIcon(
              icon: HugeIcons.strokeRoundedEdit02,
              color: colors.textBase,
              size: 20,
            ),
            label: context.l10n.edit,
            isFirst: true,
            isLast: false,
          ),
        ),
      );

      items.add(
        PopupMenuItem<String>(
          value: 'delete',
          padding: EdgeInsets.zero,
          height: 0,
          child: PopupMenuItemWidget(
            icon: HugeIcon(
              icon: HugeIcons.strokeRoundedDelete01,
              color: colors.warning,
              size: 20,
            ),
            label: context.l10n.delete,
            isFirst: false,
            isLast: true,
            isWarning: true,
          ),
        ),
      );
    }

    if (collectionViewType == CollectionViewType.sharedCollectionViewer ||
        collectionViewType == CollectionViewType.sharedCollectionCollaborator) {
      items.add(
        PopupMenuItem<String>(
          value: 'leave_collection',
          padding: EdgeInsets.zero,
          height: 0,
          child: PopupMenuItemWidget(
            icon: HugeIcon(
              icon: HugeIcons.strokeRoundedLogout02,
              color: colors.warning,
              size: 20,
            ),
            label: context.l10n.leaveCollection,
            isFirst: true,
            isLast: true,
            isWarning: true,
          ),
        ),
      );
    }

    return items;
  }

  void _handleMenuAction(BuildContext context, String action) {
    switch (action) {
      case 'edit':
        _editCollection(context);
        break;
      case 'delete':
        _deleteCollection(context);
        break;
      case 'leave_collection':
        _leaveCollection(context);
        break;
    }
  }

  Future<void> _editCollection(BuildContext context) async {
    await CollectionActions.editCollection(context, collection);
  }

  Future<void> _deleteCollection(BuildContext context) async {
    await CollectionActions.deleteCollection(context, collection);
  }

  Future<void> _leaveCollection(BuildContext context) async {
    await CollectionActions.leaveCollection(context, collection);
  }
}
