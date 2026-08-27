import 'dart:typed_data';

import 'package:ente_contacts/contacts.dart';
import 'package:locker/src/rust/third_party/ente_frb_contacts.dart' as rust;
import 'package:locker/src/rust/third_party/ente_frb_core.dart';

Future<ContactOutput<ContactRecord>> createContact(
  Session session,
  WrappedRootContactKey? key,
  ContactData data,
) async {
  final output = await rust.createContact(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    data: rust.ContactData(contactUserId: data.contactUserId, name: data.name),
  );
  return _output(_fromRustRecord(output.record), output.wrappedRootContactKey);
}

Future<ContactOutput<List<ContactRecord>>> getDiff(
  Session session,
  WrappedRootContactKey? key,
  int sinceTime,
  int limit,
) async {
  final output = await rust.getDiff(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    sinceTime: sinceTime,
    limit: limit,
  );
  return _output(
    output.records.map(_fromRustRecord).toList(growable: false),
    output.wrappedRootContactKey,
  );
}

Future<ContactOutput<ContactRecord>> updateContact(
  Session session,
  WrappedRootContactKey? key,
  String contactId,
  ContactData data,
) async {
  final output = await rust.updateContact(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    contactId: contactId,
    data: rust.ContactData(contactUserId: data.contactUserId, name: data.name),
  );
  return _output(_fromRustRecord(output.record), output.wrappedRootContactKey);
}

Future<void> deleteContact(Session session, String contactId) =>
    rust.deleteContact(session: session, contactId: contactId);

Future<ContactOutput<ContactRecord>> setAttachment(
  Session session,
  WrappedRootContactKey? key,
  String contactId,
  ContactAttachmentType attachmentType,
  Uint8List bytes,
) async {
  final output = await rust.setAttachment(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    contactId: contactId,
    attachmentType: _toRustAttachmentType(attachmentType),
    attachmentBytes: bytes,
  );
  return _output(_fromRustRecord(output.record), output.wrappedRootContactKey);
}

Future<ContactOutput<ContactRecord>> deleteAttachment(
  Session session,
  WrappedRootContactKey? key,
  String contactId,
  ContactAttachmentType attachmentType,
) async {
  final output = await rust.deleteAttachment(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    contactId: contactId,
    attachmentType: _toRustAttachmentType(attachmentType),
  );
  return _output(_fromRustRecord(output.record), output.wrappedRootContactKey);
}

Future<ContactOutput<Uint8List>> getProfilePicture(
  Session session,
  WrappedRootContactKey? key,
  String contactId,
) async {
  final output = await rust.getProfilePicture(
    session: session,
    wrappedRootContactKey: _toRustKey(key),
    contactId: contactId,
  );
  return _output(output.bytes, output.wrappedRootContactKey);
}

ContactOutput<T> _output<T>(T value, rust.WrappedRootContactKey? key) =>
    ContactOutput(value: value, wrappedRootContactKey: _fromRustKey(key));

rust.WrappedRootContactKey? _toRustKey(WrappedRootContactKey? key) =>
    key == null
    ? null
    : rust.WrappedRootContactKey(
        encryptedKey: key.encryptedKey,
        header: key.header,
      );

WrappedRootContactKey? _fromRustKey(rust.WrappedRootContactKey? key) =>
    key == null
    ? null
    : WrappedRootContactKey(encryptedKey: key.encryptedKey, header: key.header);

rust.AttachmentType _toRustAttachmentType(
  ContactAttachmentType attachmentType,
) => switch (attachmentType) {
  ContactAttachmentType.profilePicture => rust.AttachmentType.profilePicture,
};

ContactRecord _fromRustRecord(rust.ContactRecord record) {
  final data = record.isDeleted
      ? null
      : ContactData(contactUserId: record.contactUserId, name: record.name!);
  return ContactRecord(
    id: record.id,
    contactUserId: record.contactUserId,
    email: record.email,
    data: data,
    profilePictureAttachmentId: record.profilePictureAttachmentId,
    isDeleted: record.isDeleted,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  );
}
