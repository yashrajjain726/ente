import "package:ente_components/ente_components.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/ui/components/collection_share_badge.dart";
import "package:photos/ui/sharing/share_components.dart";
import "package:photos/ui/sharing/verify_identity_dialog.dart";
import "package:photos/ui/sharing/widgets/selected_person_chip.dart";
import "package:photos/ui/sharing/widgets/sharing_role.dart";

Future<CollectionParticipantRole?> showChooseAccessSheet(
  BuildContext context, {
  required List<UserSuggestion> selected,
  required CollectionParticipantRole initialRole,
}) {
  return showBottomSheetComponent<CollectionParticipantRole>(
    context: context,
    builder: (sheetContext) =>
        _ChooseAccessSheet(selected: selected, initialRole: initialRole),
  );
}

class _ChooseAccessSheet extends StatefulWidget {
  const _ChooseAccessSheet({required this.selected, required this.initialRole});

  final List<UserSuggestion> selected;
  final CollectionParticipantRole initialRole;

  @override
  State<_ChooseAccessSheet> createState() => _ChooseAccessSheetState();
}

class _ChooseAccessSheetState extends State<_ChooseAccessSheet> {
  final _selectedPeopleScrollController = ScrollController();
  late CollectionParticipantRole _role;

  @override
  void initState() {
    super.initState();
    _role = widget.initialRole;
  }

  @override
  void dispose() {
    _selectedPeopleScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.95,
      ),
      child: BottomSheetComponent(
        title: context.strings.chooseAccess,
        content: Flexible(
          fit: FlexFit.loose,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SelectedRecipientChips(
                  suggestions: widget.selected,
                  scrollController: _selectedPeopleScrollController,
                  onRemove: _removeSuggestion,
                  onLongPress: (suggestion) => showVerifyIdentitySheet(
                    context,
                    self: false,
                    email: suggestion.email,
                  ),
                ),
                ShareSectionTitle(context.strings.permissions),
                ShareMenuGroup(
                  items: [
                    _PermissionRow(
                      label: context.strings.viewer,
                      description: context.strings.viewerRoleDescription,
                      icon: sharingRoleIcon(CollectionParticipantRole.viewer),
                      selected: _role == CollectionParticipantRole.viewer,
                      onTap: () => setState(
                        () => _role = CollectionParticipantRole.viewer,
                      ),
                    ),
                    _PermissionRow(
                      label: context.strings.collaborator,
                      description: context.strings.collaboratorRoleDescription,
                      icon: sharingRoleIcon(
                        CollectionParticipantRole.collaborator,
                      ),
                      selected: _role == CollectionParticipantRole.collaborator,
                      onTap: () => setState(
                        () => _role = CollectionParticipantRole.collaborator,
                      ),
                    ),
                    _PermissionRow(
                      label: context.strings.admin,
                      description: context.strings.adminRoleDescription,
                      icon: sharingRoleIcon(CollectionParticipantRole.admin),
                      selected: _role == CollectionParticipantRole.admin,
                      onTap: () => setState(
                        () => _role = CollectionParticipantRole.admin,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        actions: [
          ButtonComponent(
            label: _buttonLabel(context),
            variant: ButtonComponentVariant.primary,
            size: ButtonComponentSize.large,
            isDisabled: widget.selected.isEmpty,
            onTap: () => Navigator.of(context).pop(_role),
          ),
        ],
      ),
    );
  }

  void _removeSuggestion(UserSuggestion suggestion) {
    setState(() {
      widget.selected.removeWhere(
        (selected) =>
            selected.email.trim().toLowerCase() ==
            suggestion.email.trim().toLowerCase(),
      );
    });
  }

  String _buttonLabel(BuildContext context) {
    return switch (_role) {
      CollectionParticipantRole.viewer => context.strings.addAsViewers(
        count: widget.selected.length,
      ),
      CollectionParticipantRole.collaborator =>
        context.strings.addAsCollaborators(count: widget.selected.length),
      CollectionParticipantRole.admin => context.strings.addAsAdmins(
        count: widget.selected.length,
      ),
      CollectionParticipantRole.unknown || CollectionParticipantRole.owner =>
        context.strings.addAsViewers(count: widget.selected.length),
    };
  }
}

class _PermissionRow extends StatelessWidget {
  const _PermissionRow({
    required this.label,
    required this.description,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String description;
  final List<List<dynamic>> icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ShareMenuItem(
      title: label,
      subtitle: description,
      icon: icon,
      trailing: selected
          ? const CollectionSelectedBadge()
          : SizedBox.square(
              dimension: IconSizes.small,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: context.componentColors.strokeDark),
                ),
              ),
            ),
      onTap: onTap,
    );
  }
}
