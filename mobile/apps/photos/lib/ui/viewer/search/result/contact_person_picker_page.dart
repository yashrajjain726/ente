import "package:ente_components/ente_components.dart";
import "package:flutter/material.dart";
import "package:hugeicons/hugeicons.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/ml/face/person.dart";
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

class ContactPersonPickerPage extends StatelessWidget {
  const ContactPersonPickerPage({
    required this.contactUserId,
    required this.contactEmail,
    required this.persons,
    super.key,
  });

  final int contactUserId;
  final String contactEmail;
  final List<PersonEntity> persons;
  static const _horizontalPadding = 16.0;
  static const _gridGap = 10.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.componentColors;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: colors.backgroundBase,
      body: AppBarComponent(
        title: l10n.selectPerson,
        subtitle: l10n.selectPersonToLinkToThisContact,
        actions: [
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
        slivers: [_buildGrid(persons)],
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
                key: ValueKey(persons[index].remoteID),
                person: persons[index],
                size: tileSize,
                contactUserId: contactUserId,
                contactEmail: contactEmail,
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
    super.key,
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
