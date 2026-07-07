import "package:collection/collection.dart";
import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/ml/face/person.dart";
import "package:photos/services/machine_learning/face_ml/person/person_service.dart";
import "package:photos/ui/common/loading_widget.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/ui/viewer/people/face_thumbnail_squircle.dart";
import "package:photos/ui/viewer/people/person_face_widget.dart";
import "package:photos/utils/person_contact_linking_util.dart";

abstract class ContactPersonPickerResult {
  const ContactPersonPickerResult();
}

class ContactPersonPickerSelected extends ContactPersonPickerResult {
  const ContactPersonPickerSelected(this.person);

  final PersonEntity person;
}

class ContactPersonPickerPickPhoto extends ContactPersonPickerResult {
  const ContactPersonPickerPickPhoto();
}

class ContactPersonPickerPage extends StatefulWidget {
  const ContactPersonPickerPage({
    required this.contactUserId,
    required this.contactEmail,
    super.key,
  });

  final int contactUserId;
  final String contactEmail;

  @override
  State<ContactPersonPickerPage> createState() =>
      _ContactPersonPickerPageState();
}

class _ContactPersonPickerPageState extends State<ContactPersonPickerPage> {
  static const _horizontalPadding = 16.0;
  static const _gridGap = 10.0;

  late final Future<List<PersonEntity>> _personsFuture;

  @override
  void initState() {
    super.initState();
    _personsFuture = _loadPersons();
  }

  Future<List<PersonEntity>> _loadPersons() async {
    final persons = await PersonService.instance.getPersons();
    final visiblePersons = persons
        .where((person) => !person.data.isIgnored)
        .toList();
    visiblePersons.sort((first, second) {
      final nameComparison = compareAsciiLowerCaseNatural(
        first.data.name,
        second.data.name,
      );
      if (nameComparison != 0) {
        return nameComparison;
      }
      return first.remoteID.compareTo(second.remoteID);
    });
    return visiblePersons;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundBase,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHeader(context, l10n)),
          FutureBuilder<List<PersonEntity>>(
            future: _personsFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SliverFillRemaining(
                  child: Center(child: EnteLoadingWidget()),
                );
              }
              if (!snapshot.hasData || snapshot.data!.isEmpty) {
                return SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Text(
                      "${l10n.noResultsFound}.",
                      style: TextStyles.body.copyWith(color: colors.textLight),
                    ),
                  ),
                );
              }
              return _buildGrid(snapshot.data!);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppLocalizations l10n) {
    final colors = context.componentColors;
    final topPadding = MediaQuery.paddingOf(context).top;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        _horizontalPadding,
        topPadding + 24,
        _horizontalPadding,
        20,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.selectPerson,
                  style: TextStyles.h1Bold.copyWith(
                    color: colors.textBase,
                    height: 1.12,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.selectPersonToLinkToThisContact,
                  style: TextStyles.body.copyWith(color: colors.textLight),
                ),
              ],
            ),
          ),
          const SizedBox(width: Spacing.md),
          IconButtonComponent(
            variant: IconButtonComponentVariant.primary,
            shouldSurfaceExecutionStates: false,
            tooltip: l10n.setAContactPhoto,
            icon: const HugeIcon(icon: HugeIcons.strokeRoundedImageAdd02),
            onTap: () {
              Navigator.of(context).pop(const ContactPersonPickerPickPhoto());
            },
          ),
        ],
      ),
    );
  }

  Widget _buildGrid(List<PersonEntity> persons) {
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(
        _horizontalPadding,
        0,
        _horizontalPadding,
        48,
      ),
      sliver: SliverLayoutBuilder(
        builder: (context, constraints) {
          const crossAxisCount = 3;
          final tileSize =
              (constraints.crossAxisExtent -
                  (_gridGap * (crossAxisCount - 1))) /
              crossAxisCount;
          return SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: crossAxisCount,
              mainAxisSpacing: 20,
              crossAxisSpacing: _gridGap,
              childAspectRatio: tileSize / (tileSize + 30),
            ),
            delegate: SliverChildBuilderDelegate(
              childCount: persons.length,
              (context, index) => _PersonTile(
                person: persons[index],
                size: tileSize,
                contactUserId: widget.contactUserId,
                contactEmail: widget.contactEmail,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PersonTile extends StatelessWidget {
  const _PersonTile({
    required this.person,
    required this.size,
    required this.contactUserId,
    required this.contactEmail,
  });

  final PersonEntity person;
  final double size;
  final int contactUserId;
  final String contactEmail;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final pixelWidth = (size * MediaQuery.devicePixelRatioOf(context)).round();

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (isLinkedToDifferentContact(
          person,
          contactUserId: contactUserId,
          email: contactEmail,
        )) {
          showShortToast(
            context,
            AppLocalizations.of(context).personAlreadyLinkedToAnotherContact,
          );
          return;
        }
        Navigator.of(context).pop(ContactPersonPickerSelected(person));
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox.square(
            dimension: size,
            child: FaceThumbnailSquircleClip(
              borderRadius: faceThumbnailSquircleBorderRadius(size),
              child: ColoredBox(
                color: colors.strokeFaint,
                child: PersonFaceWidget(
                  personId: person.remoteID,
                  keepAlive: true,
                  cachedPixelWidth: pixelWidth,
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            person.data.name,
            maxLines: 1,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyles.body.copyWith(
              color: colors.textBase,
              height: 20 / 14,
            ),
          ),
        ],
      ),
    );
  }
}
