import XCTest
@testable import Ensu

private final class UnavailableNotesSource: NotesSource {
    func listDocuments() throws -> [NotesDocument] {
        throw NotesError.Unavailable
    }
    func readDocument(documentId: String) throws -> NotesRead {
        throw NotesError.Unavailable
    }
}

final class NotesIntegrationTests: XCTestCase {
    private let collectionID = "123e4567-e89b-12d3-a456-426614174000"

    func testMissingDocumentRequiresReconciliationOnlyWhileRootIsAvailable() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        XCTAssertThrowsError(try Data(contentsOf: root.appendingPathComponent("missing.md"))) {
            XCTAssertEqual(IOSNotesSource.documentReadError($0, root: root) as? NotesError, .SourceChanged)
        }
        let missing = NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))
        let coordinated = NSError(domain: NSCocoaErrorDomain, code: NSFileReadUnknownError,
            userInfo: [NSUnderlyingErrorKey: missing])
        XCTAssertEqual(IOSNotesSource.documentReadError(coordinated, root: root) as? NotesError, .SourceChanged)
        let transient = NSError(domain: NSCocoaErrorDomain, code: NSFileReadUnknownError)
        guard case .SourceRead = IOSNotesSource.documentReadError(transient, root: root) as? NotesError else {
            return XCTFail("A provider failure must remain a read error")
        }
        try FileManager.default.removeItem(at: root)
        XCTAssertEqual(IOSNotesSource.documentReadError(coordinated, root: root) as? NotesError, .Unavailable)
    }

    func testNativeSourceFailureAndCancellationCrossTheBridge() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let collection = try NotesCollection(indexRoot: root.path, collectionId: collectionID)
        let source = UnavailableNotesSource()
        XCTAssertThrowsError(try collection.inspectFreshness(source: source, cancellation: NotesCancellation())) {
            XCTAssertEqual($0 as? NotesError, .Unavailable)
        }
        let cancellation = NotesCancellation()
        cancellation.cancel()
        XCTAssertThrowsError(try collection.inspectFreshness(source: source, cancellation: cancellation)) {
            XCTAssertEqual($0 as? NotesError, .Cancelled)
        }
    }
}
