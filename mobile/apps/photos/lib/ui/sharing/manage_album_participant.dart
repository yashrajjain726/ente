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

  @override
  Widget build(BuildContext context) {
    final isAdmin = widget.user.isAdmin;
    final isCollaborator = widget.user.isCollaborator;
    final isViewer = widget.user.isViewer;
    final resolvedName = resolveDisplayName(widget.user);
    bool isConvertToViewSuccess = false;
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
                  : () async {
                      final result = await collectionActions
                          .addEmailToCollection(
                            context,
                            widget.collection,
                            widget.user.email,
                            CollectionParticipantRole.admin,
                          );
                      if (result && mounted) {
                        widget.user.role = CollectionParticipantRole.admin
                            .toStringVal();
                        setState(() => {});
                      }
                    },
            ),
            ShareMenuItem(
              title: context.strings.collaborator,
              icon: HugeIcons.strokeRoundedUserGroup,
              trailing: isCollaborator ? shareCheck(context) : null,
              onTap: isCollaborator
                  ? null
                  : () async {
                      final result = await collectionActions
                          .addEmailToCollection(
                            context,
                            widget.collection,
                            widget.user.email,
                            CollectionParticipantRole.collaborator,
                          );
                      if (result && mounted) {
                        widget.user.role = CollectionParticipantRole
                            .collaborator
                            .toStringVal();
                        setState(() => {});
                      }
                    },
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
                      if (actionResult?.action != null) {
                        if (actionResult!.action == ButtonAction.first) {
                          try {
                            if (!context.mounted) return;
                            isConvertToViewSuccess = await collectionActions
                                .addEmailToCollection(
                                  context,
                                  widget.collection,
                                  widget.user.email,
                                  CollectionParticipantRole.viewer,
                                );
                          } catch (e) {
                            if (!context.mounted) return;
                            await showGenericErrorDialog(
                              context: context,
                              error: e,
                            );
                          }
                          if (isConvertToViewSuccess && mounted) {
                            isConvertToViewSuccess = false;
                            widget.user.role = CollectionParticipantRole.viewer
                                .toStringVal();
                            setState(() => {});
                          }
                        }
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
