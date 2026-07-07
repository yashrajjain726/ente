import "package:photos/core/configuration.dart";
import "package:photos/services/machine_learning/face_ml/person/person_service.dart";

Future<bool> isMeAssigned() async {
  final personEntities = await PersonService.instance.getPersons();
  final currentUserEmail = Configuration.instance
      .getEmail()
      ?.trim()
      .toLowerCase();
  final currentUserID = Configuration.instance.getUserID();

  bool isAssigned = false;
  for (final personEntity in personEntities) {
    final personEmail = personEntity.data.email?.trim().toLowerCase();
    if ((currentUserEmail != null && personEmail == currentUserEmail) ||
        (currentUserID != null && personEntity.data.userID == currentUserID)) {
      isAssigned = true;
      break;
    }
  }
  return isAssigned;
}
