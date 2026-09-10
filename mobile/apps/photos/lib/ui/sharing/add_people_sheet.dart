import "dart:math" as math;

import "package:collection/collection.dart";
import "package:email_validator/email_validator.dart";
import "package:ente_components/ente_components.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:ente_strings/ente_strings.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:photos/core/configuration.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/services/account/user_service.dart";
import "package:photos/services/collections_service.dart";
import "package:photos/services/contacts/contact_identity_resolver.dart";
import "package:photos/ui/actions/collection/collection_sharing_actions.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/ui/sharing/choose_access_sheet.dart";
import "package:photos/ui/sharing/manage_links_widget.dart";
import "package:photos/ui/sharing/share_components.dart";
import "package:photos/ui/sharing/user_avator_widget.dart";
import "package:photos/ui/sharing/verify_identity_dialog.dart";
import "package:photos/ui/sharing/widgets/selected_person_chip.dart";
import "package:photos/ui/sharing/widgets/sharing_progress_sheet.dart";
import "package:photos/utils/dialog_util.dart";
import "package:photos/utils/share_util.dart";

Future<bool> showAddPeopleSheet(
  BuildContext context,
  List<Collection> collections,
) async {
  if (collections.isEmpty) {
    return false;
  }
  final selected = <UserSuggestion>[];
  late CollectionParticipantRole role;
  while (true) {
    final shouldContinue = await showBottomSheetComponent<bool>(
      context: context,
      builder: (sheetContext) =>
          _AddPeopleSheet(collections: collections, selected: selected),
    );
    if (shouldContinue != true || !context.mounted) {
      return false;
    }
    final selectedRole = await showChooseAccessSheet(
      context,
      selected: selected,
      initialRole: CollectionParticipantRole.viewer,
    );
    if (!context.mounted) {
      return false;
    }
    if (selectedRole == null) {
      continue;
    }
    role = selectedRole;
    break;
  }
  final actions = CollectionActions(CollectionsService.instance);
  AddEmailToCollectionResult? failure;
  final success = await showSharingProgressSheet(
    context,
    task: () async {
      failure = await _shareSelected(
        collections: collections,
        selected: selected,
        role: role,
        actions: actions,
      );
      return failure == null;
    },
  );
  if (!success && failure != null && context.mounted) {
    await actions.showAddEmailToCollectionFailure(context, failure!);
  }
  return success;
}

Future<AddEmailToCollectionResult?> _shareSelected({
  required List<Collection> collections,
  required List<UserSuggestion> selected,
  required CollectionParticipantRole role,
  required CollectionActions actions,
}) async {
  AddEmailToCollectionResult? firstFailure;
  for (final collection in collections) {
    for (final suggestion in selected) {
      if (!_needsShare(collection, suggestion.email)) {
        continue;
      }
      final result = await actions.addEmailToCollection(
        collection,
        suggestion.email,
        role,
      );
      if (!result.succeeded) {
        firstFailure ??= result;
      }
    }
  }
  return firstFailure;
}

bool _needsShare(Collection collection, String email) {
  final normalized = email.trim().toLowerCase();
  if (collection.owner.email.trim().toLowerCase() == normalized) {
    return false;
  }
  return !collection.sharees.any(
    (sharee) => sharee.email.trim().toLowerCase() == normalized,
  );
}

bool _hasActiveLink(Collection collection) {
  final url = collection.publicURLs.firstOrNull;
  return url != null && !url.isExpired;
}

bool _canUseNonEnteFallback(Collection collection, int currentUserID) {
  if (_hasActiveLink(collection)) {
    return true;
  }
  return collection.isOwner(currentUserID);
}

class _AddPeopleSheet extends StatefulWidget {
  const _AddPeopleSheet({required this.collections, required this.selected});

  final List<Collection> collections;
  final List<UserSuggestion> selected;

  @override
  State<_AddPeopleSheet> createState() => _AddPeopleSheetState();
}

class _AddPeopleSheetState extends State<_AddPeopleSheet> {
  final _textController = TextEditingController();
  final _focusNode = FocusNode();
  final _selectedPeopleScrollController = ScrollController();
  final _contactsScrollController = ScrollController();
  final _fallbackShareKey = GlobalKey();
  late final List<UserSuggestion> _contacts;
  bool _emailIsValid = false;
  bool _emailHasNoAccount = false;

  @override
  void initState() {
    super.initState();
    _contacts = UserService.instance.getRelevantContacts().where((suggestion) {
      return widget.collections.any(
        (collection) => _needsShare(collection, suggestion.email),
      );
    }).toList()..sort((a, b) => a.email.compareTo(b.email));
  }

  @override
  void dispose() {
    _textController.dispose();
    _focusNode.dispose();
    _selectedPeopleScrollController.dispose();
    _contactsScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selectedEmails = {
      for (final suggestion in widget.selected)
        suggestion.email.trim().toLowerCase(),
    };
    final query = _textController.text.trim().toLowerCase();
    final filteredContacts = _contacts
        .where(
          (contact) =>
              !selectedEmails.contains(contact.email.trim().toLowerCase()) &&
              matchesResolvedSuggestionQuery(contact, query),
        )
        .toList();
    final keyboardVisible = MediaQuery.viewInsetsOf(context).bottom > 0;

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.95,
      ),
      child: BottomSheetComponent(
        title: context.strings.addPeople,
        isKeyboardAware: true,
        content: Flexible(
          fit: FlexFit.loose,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectedRecipientChips(
                suggestions: widget.selected,
                scrollController: _selectedPeopleScrollController,
                onRemove: _toggleSuggestion,
                onLongPress: (suggestion) => showVerifyIdentitySheet(
                  context,
                  self: false,
                  email: suggestion.email,
                ),
              ),
              _EmailField(
                controller: _textController,
                focusNode: _focusNode,
                emailIsValid: _emailIsValid,
                emailHasNoAccount: _emailHasNoAccount,
                onChanged: (value) {
                  setState(() {
                    _emailIsValid = EmailValidator.validate(value.trim());
                    _emailHasNoAccount = false;
                  });
                  _scrollContactsToStart();
                },
                onSubmit: _tryAddTypedEmail,
              ),
              _NonEnteFallback(
                collection:
                    _emailHasNoAccount &&
                        widget.collections.length == 1 &&
                        _canUseNonEnteFallback(
                          widget.collections.first,
                          Configuration.instance.getUserID()!,
                        )
                    ? widget.collections.first
                    : null,
                shareKey: _fallbackShareKey,
                onTap: _shareFallback,
              ),
              if (filteredContacts.isNotEmpty) ...[
                const SizedBox(height: Spacing.xxl),
                ShareSectionTitle(context.strings.fromYourContacts),
                Flexible(
                  fit: FlexFit.loose,
                  child: _ContactSuggestions(
                    contacts: filteredContacts,
                    scrollController: _contactsScrollController,
                    onToggle: _toggleSuggestion,
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: keyboardVisible
            ? const []
            : [
                ButtonComponent(
                  label: context.strings.continueLabel,
                  variant: ButtonComponentVariant.primary,
                  size: ButtonComponentSize.large,
                  isDisabled: widget.selected.isEmpty,
                  onTap: () => Navigator.of(context).pop(true),
                ),
              ],
      ),
    );
  }

  Future<void> _tryAddTypedEmail() async {
    final email = _textController.text.trim().toLowerCase();
    if (!EmailValidator.validate(email)) {
      return;
    }
    if (email == Configuration.instance.getEmail()?.trim().toLowerCase()) {
      await showErrorDialog(
        context,
        context.strings.oops,
        context.strings.youCannotShareWithYourself,
      );
      return;
    }
    if (_isSelected(email)) {
      _clearEmail();
      return;
    }
    if (!widget.collections.any(
      (collection) => _needsShare(collection, email),
    )) {
      showShortToast(context, context.strings.personAlreadyHasAccess);
      _clearEmail();
      return;
    }
    setState(() => _emailHasNoAccount = false);
    try {
      final publicKey = await UserService.instance.getPublicKey(email);
      if (!mounted) {
        return;
      }
      if (_textController.text.trim().toLowerCase() != email ||
          _isSelected(email)) {
        return;
      }
      if (publicKey == null || publicKey.isEmpty) {
        setState(() => _emailHasNoAccount = true);
        if (widget.collections.length != 1 ||
            !_canUseNonEnteFallback(
              widget.collections.first,
              Configuration.instance.getUserID()!,
            )) {
          await CollectionActions(
            CollectionsService.instance,
          ).showAddEmailToCollectionFailure(
            context,
            AddEmailToCollectionResult.failure(
              failure: AddEmailToCollectionFailure.noAccount,
              email: email,
            ),
          );
        }
        return;
      }
      final suggestion = _contacts.firstWhereOrNull(
        (contact) => contact.email.trim().toLowerCase() == email,
      );
      setState(() {
        widget.selected.add(suggestion ?? UserSuggestion(email));
      });
      _clearEmail();
      _scrollSelectedPeopleToEnd();
    } catch (error) {
      if (mounted) {
        setState(() => _emailHasNoAccount = false);
        await showGenericErrorDialog(context: context, error: error);
      }
    }
  }

  void _toggleSuggestion(UserSuggestion suggestion) {
    _focusNode.unfocus();
    var added = false;
    setState(() {
      final index = widget.selected.indexWhere(
        (selected) =>
            selected.email.trim().toLowerCase() ==
            suggestion.email.trim().toLowerCase(),
      );
      if (index == -1) {
        widget.selected.add(suggestion);
        added = true;
      } else {
        widget.selected.removeAt(index);
      }
    });
    if (added) {
      _scrollSelectedPeopleToEnd();
    }
  }

  void _scrollSelectedPeopleToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_selectedPeopleScrollController.hasClients) {
        return;
      }
      _selectedPeopleScrollController.animateTo(
        _selectedPeopleScrollController.position.maxScrollExtent,
        duration: Motion.quick,
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _scrollContactsToStart() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_contactsScrollController.hasClients) {
        return;
      }
      _contactsScrollController.jumpTo(0);
    });
  }

  bool _isSelected(String email) {
    return widget.selected.any(
      (selected) =>
          selected.email.trim().toLowerCase() == email.trim().toLowerCase(),
    );
  }

  void _clearEmail() {
    _textController.clear();
    _focusNode.unfocus();
    setState(() {
      _emailIsValid = false;
      _emailHasNoAccount = false;
    });
  }

  Future<void> _shareFallback() async {
    if (widget.collections.length != 1) {
      return;
    }
    final collection = widget.collections.first;
    final currentUserID = Configuration.instance.getUserID()!;
    if (!_canUseNonEnteFallback(collection, currentUserID)) {
      return;
    }
    if (collection.hasLink && !_hasActiveLink(collection)) {
      await routeToPage(
        context,
        ManageSharedLinkWidget(collection: collection),
      );
      if (mounted) {
        setState(() {});
      }
      return;
    }
    if (!_hasActiveLink(collection)) {
      final enabled = await CollectionActions(
        CollectionsService.instance,
      ).enableUrl(context, collection);
      if (!enabled || !mounted || !_hasActiveLink(collection)) {
        return;
      }
      setState(() {});
    }
    final url = CollectionsService.instance.getPublicUrl(collection);
    await shareAlbumLink(
      context,
      url,
      _fallbackShareKey,
      albumName: collection.displayName,
      albumDescription: collection.displayDescription,
    );
  }
}

class _EmailField extends StatelessWidget {
  const _EmailField({
    required this.controller,
    required this.focusNode,
    required this.emailIsValid,
    required this.emailHasNoAccount,
    required this.onChanged,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool emailIsValid;
  final bool emailHasNoAccount;
  final ValueChanged<String> onChanged;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: TextInputComponent(
            controller: controller,
            focusNode: focusNode,
            hintText: context.strings.enterAnEmailAddress,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            autocorrect: false,
            enableSuggestions: false,
            isClearable: true,
            messageType: emailHasNoAccount
                ? TextInputComponentMessageType.error
                : TextInputComponentMessageType.helper,
            message: emailHasNoAccount
                ? context.strings.noEnteAccountWithThisEmail
                : null,
            onChanged: onChanged,
            onSubmit: (_) => onSubmit(),
          ),
        ),
        const SizedBox(width: Spacing.sm),
        Padding(
          padding: const EdgeInsets.only(top: Spacing.sm),
          child: IconButtonComponent(
            variant: IconButtonComponentVariant.green,
            shouldSurfaceExecutionStates: false,
            tooltip: context.strings.add,
            icon: const HugeIcon(icon: HugeIcons.strokeRoundedMailAdd01),
            onTap: emailIsValid ? onSubmit : null,
          ),
        ),
      ],
    );
  }
}

class _NonEnteFallback extends StatelessWidget {
  const _NonEnteFallback({
    required this.collection,
    required this.shareKey,
    required this.onTap,
  });

  final Collection? collection;
  final GlobalKey shareKey;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    final collection = this.collection;
    return AnimatedSize(
      duration: Motion.standard,
      curve: Curves.easeOutCubic,
      alignment: AlignmentDirectional.topStart,
      child: collection == null
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsets.only(top: Spacing.md),
              child: ShareMenuItem(
                key: shareKey,
                title: _hasActiveLink(collection)
                    ? context.strings.shareYourAlbumLink
                    : context.strings.createPublicLink,
                subtitle: _hasActiveLink(collection)
                    ? context.strings.albumAlreadyHasPublicLink
                    : context.strings.shareWithPeopleNotOnEnte,
                icon: HugeIcons.strokeRoundedLink04,
                showChevron: true,
                onTap: onTap,
              ),
            ),
    );
  }
}

class _ContactSuggestions extends StatelessWidget {
  const _ContactSuggestions({
    required this.contacts,
    required this.scrollController,
    required this.onToggle,
  });

  static const _crossAxisCount = 4;
  static const _visibleRows = 2;
  static double rowExtent(BuildContext context) {
    const textStyle = TextStyles.mini;
    final lineExtent =
        MediaQuery.textScalerOf(context).scale(textStyle.fontSize!) *
        textStyle.height!;
    return math.max(
      104.0,
      getAvatarSize(AvatarType.huge) + Spacing.sm + lineExtent * 2,
    );
  }

  final List<UserSuggestion> contacts;
  final ScrollController scrollController;
  final ValueChanged<UserSuggestion> onToggle;

  @override
  Widget build(BuildContext context) {
    final rowExtent = _ContactSuggestions.rowExtent(context);
    final maxViewportHeight = rowExtent * _visibleRows + Spacing.lg;
    final totalRows = (contacts.length / _crossAxisCount).ceil();
    final contentHeight =
        totalRows * rowExtent + math.max(0, totalRows - 1) * Spacing.lg;
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableHeight = constraints.hasBoundedHeight
            ? constraints.maxHeight
            : maxViewportHeight;
        final viewportHeight = math.max(
          0.0,
          math.min(contentHeight, math.min(maxViewportHeight, availableHeight)),
        );
        if (viewportHeight == 0) {
          return const SizedBox.shrink();
        }
        final showScrollbar = contentHeight > viewportHeight + 0.5;
        final grid = GridView.builder(
          key: const ValueKey("contact-suggestions-scroll"),
          controller: scrollController,
          primary: false,
          padding: showScrollbar
              ? const EdgeInsetsDirectional.only(end: Spacing.sm + 5)
              : EdgeInsets.zero,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: _crossAxisCount,
            mainAxisSpacing: Spacing.lg,
            crossAxisSpacing: Spacing.sm,
            mainAxisExtent: rowExtent,
          ),
          itemCount: contacts.length,
          itemBuilder: (context, index) {
            final contact = contacts[index];
            return _ContactSuggestion(
              key: ValueKey("contact-${contact.email.trim().toLowerCase()}"),
              suggestion: contact,
              onTap: () => onToggle(contact),
              onLongPress: () => showVerifyIdentitySheet(
                context,
                self: false,
                email: contact.email,
              ),
            );
          },
        );
        return SizedBox(
          height: viewportHeight,
          child: showScrollbar
              ? RawScrollbar(
                  key: const ValueKey("contact-suggestions-scrollbar"),
                  controller: scrollController,
                  thumbVisibility: true,
                  trackVisibility: true,
                  interactive: true,
                  thickness: 5,
                  radius: const Radius.circular(3),
                  trackRadius: const Radius.circular(3),
                  thumbColor: context.componentColors.fillDarkest,
                  trackColor: context.componentColors.fillDark,
                  padding: EdgeInsets.zero,
                  child: grid,
                )
              : grid,
        );
      },
    );
  }
}

class _ContactSuggestion extends StatelessWidget {
  const _ContactSuggestion({
    super.key,
    required this.suggestion,
    required this.onTap,
    required this.onLongPress,
  });

  final UserSuggestion suggestion;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final label = resolveSuggestionDisplayName(suggestion);
    return InkWell(
      key: ValueKey(
        "contact-suggestion-${suggestion.email.trim().toLowerCase()}",
      ),
      borderRadius: BorderRadius.circular(Radii.button),
      onTap: onTap,
      onLongPress: onLongPress,
      child: Column(
        children: [
          UserAvatarWidget.suggestion(suggestion, type: AvatarType.huge),
          const SizedBox(height: Spacing.sm),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyles.mini.copyWith(
              color: context.componentColors.textLight,
            ),
          ),
        ],
      ),
    );
  }
}
