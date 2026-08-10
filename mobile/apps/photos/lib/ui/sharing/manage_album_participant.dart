import 'package:ente_components/ente_components.dart';
import "package:ente_strings/ente_strings.dart";
import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import "package:photos/models/api/collection/user.dart";
import 'package:photos/models/collection/collection.dart';
import 'package:photos/services/collections_service.dart';
import "package:photos/services/contacts/contact_identity_resolver.dart";
import 'package:photos/ui/actions/collection/collection_sharing_actions.dart';
import 'package:photos/ui/components/buttons/button_widget.dart';
import 'package:photos/ui/sharing/share_components.dart';
import 'package:photos/utils/dialog_util.dart';

class ManageIndividualParticipant extends StatefulWidget {
  final Collection collection;
  final User user;

  const ManageIndividualParticipant({
    super.key,
    required this.collection,
    required this.user,
  });

  @override
  State<StatefulWidget> createState() => _ManageIndividualParticipantState();
}

class _ManageIndividualParticipantState
    extends State<ManageIndividualParticipant> {
  final CollectionActions collectionActions = CollectionActions(
    CollectionsService.instance,
  );
  late CollectionParticipantRole _role;

  @override
  void initState() {
    super.initState();
    _role = CollectionParticipantRoleExtn.fromString(widget.user.role);
  }

  Future<void> _changeRole(CollectionParticipantRole role) async {
    final changed = await collectionActions.addEmailToCollection(
      context,
      widget.collection,
      widget.user.email,
      role,
    );
    if (changed && mounted) setState(() => _role = role);
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = _role == CollectionParticipantRole.admin;
    final isCollaborator = _role == CollectionParticipantRole.collaborator;
    final isViewer = _role == CollectionParticipantRole.viewer;
    final resolvedName = resolveDisplayName(widget.user);
    return ShareScaffold(
      title: context.strings.manage,
      subtitle: resolvedName,
      children: [
        ShareSectionTitle(context.strings.addedAs),
        ShareMenuGroup(
          items: [
            ShareMenuItem(
              title: context.strings.admin,
              icon: HugeIcons.strokeRoundedCrown,
              trailing: isAdmin ? shareCheck(context) : null,
              onTap: isAdmin
                  ? null
                  : () => _changeRole(CollectionParticipantRole.admin),
            ),
            ShareMenuItem(
              title: context.strings.collaborator,
              icon: HugeIcons.strokeRoundedUserGroup,
              trailing: isCollaborator ? shareCheck(context) : null,
              onTap: isCollaborator
                  ? null
                  : () => _changeRole(CollectionParticipantRole.collaborator),
            ),
            ShareMenuItem(
              title: context.strings.viewer,
              icon: HugeIcons.strokeRoundedView,
              trailing: isViewer ? shareCheck(context) : null,
              showOnlyLoadingState: true,
              onTap: isViewer
                  ? null
                  : () async {
                      final actionResult = await showChoiceActionSheet(
                        context,
                        title: context.strings.changePermissionsQuestion,
                        firstButtonLabel: context.strings.yesConvertToViewer,
                        body: context.strings
                            .cannotAddMorePhotosAfterBecomingViewer(
                              user: resolvedName,
                            ),
                        isCritical: true,
                      );
                      if (actionResult?.action != ButtonAction.first ||
                          !context.mounted) {
                        return;
                      }
                      try {
                        await _changeRole(CollectionParticipantRole.viewer);
                      } catch (e) {
                        if (!context.mounted) return;
                        await showGenericErrorDialog(
                          context: context,
                          error: e,
                        );
                      }
                    },
            ),
          ],
        ),
        ShareSectionDescription(
          context.strings.adminsAndCollaboratorsCanAddPhotosDescription,
        ),
        const SizedBox(height: Spacing.xxl),
        ShareSectionTitle(context.strings.removeParticipant),
        ShareMenuGroup(
          items: [
            ShareMenuItem(
              title: context.strings.remove,
              leading: const Icon(Icons.not_interested_outlined),
              isDestructive: true,
              onTap: () async {
                final result = await collectionActions.removeParticipant(
                  context,
                  widget.collection,
                  widget.user,
                );

                if ((result) && mounted) {
                  if (!context.mounted) return;
                  Navigator.of(context).pop(true);
                }
              },
            ),
          ],
        ),
      ],
    );
  }
}
