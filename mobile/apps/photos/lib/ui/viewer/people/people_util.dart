import "package:photos/services/machine_learning/face_ml/person/person_service.dart";
import "package:photos/utils/person_contact_linking_util.dart";

Future<bool> isMeAssigned() async {
  final personEntities = await PersonService.instance.getPersons();
  return personEntities.any(
    (person) => isCurrentUserContactLink(
      email: person.data.email,
      userID: person.data.userID,
    ),
  );
}
