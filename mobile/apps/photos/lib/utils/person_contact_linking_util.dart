import "package:collection/collection.dart";
import "package:ente_pure_utils/ente_pure_utils.dart";
import "package:flutter/widgets.dart";
import "package:photos/l10n/l10n.dart";
import "package:photos/models/ml/face/person.dart";
import "package:photos/services/machine_learning/face_ml/person/person_service.dart";
import "package:photos/ui/viewer/people/people_page.dart";
import "package:photos/utils/dialog_util.dart";

String? normalizeContactLinkEmail(String? email) {
  final normalized = email?.trim().toLowerCase();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  return normalized;
}

bool contactLinkEmailMatches(String? first, String? second) {
  final normalizedFirst = normalizeContactLinkEmail(first);
  final normalizedSecond = normalizeContactLinkEmail(second);
  return normalizedFirst != null && normalizedFirst == normalizedSecond;
}

Future<PersonEntity?> findPersonLinkedToContact({
  required int contactUserId,
  required String? email,
}) async {
  final persons = await PersonService.instance.getPersons();
  final PersonEntity? userIdMatch = persons.firstWhereOrNull(
    (person) => person.data.userID == contactUserId,
  );
  if (userIdMatch != null) {
    return userIdMatch;
  }

  final normalizedEmail = normalizeContactLinkEmail(email);
  if (normalizedEmail == null) {
    return null;
  }
  return persons.firstWhereOrNull(
    (person) => contactLinkEmailMatches(person.data.email, normalizedEmail),
  );
}

bool isLinkedToDifferentContact(
  PersonEntity person, {
  required int contactUserId,
  required String? email,
}) {
  final linkedUserId = person.data.userID;
  if (linkedUserId != null && linkedUserId != contactUserId) {
    return true;
  }
  if (linkedUserId == contactUserId) {
    return false;
  }

  final linkedEmail = normalizeContactLinkEmail(person.data.email);
  if (linkedEmail == null) {
    return false;
  }
  return !contactLinkEmailMatches(linkedEmail, email);
}

Future<bool> checkIfEmailAlreadyAssignedToAPerson(String email) async {
  final persons = await PersonService.instance.getPersons();
  final normalizedEmail = normalizeContactLinkEmail(email);
  for (var person in persons) {
    if (contactLinkEmailMatches(person.data.email, normalizedEmail)) {
      return true;
    }
  }
  return false;
}

Future<void> showAlreadyLinkedEmailDialog(
  BuildContext context,
  String email,
) async {
  final persons = await PersonService.instance.getPersons();
  final PersonEntity? person = persons.firstWhereOrNull(
    (person) => contactLinkEmailMatches(person.data.email, email),
  );
  if (person == null) {
    return;
  }

  await showChoiceActionSheet(
    context,
    title: context.l10n.error,
    body: context.l10n.editEmailAlreadyLinked(name: person.data.name),
    firstButtonLabel: context.l10n.viewPersonToUnlink(name: person.data.name),
    firstButtonOnTap: () async {
      await routeToPage(
        context,
        PeoplePage(person: person, searchResult: null),
      );
    },
    isCritical: false,
  );
}
