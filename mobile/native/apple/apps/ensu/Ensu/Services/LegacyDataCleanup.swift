import Foundation

/// One-shot removal of data written by the retired login and sync builds, so
/// that credentials and chat copies the user can no longer see or delete do
/// not linger.
///
/// Added Jul 2026, v0.1.19. Remove once old installs age out (tag: Migration).
enum LegacyDataCleanup {
    static func run() {
        CredentialStore.shared.removeLegacyCredentials()

        let defaults = UserDefaults.standard
        for key in ["ensu.email", "ensu.userId", "ensu.lastUserId", "ensu.customEndpoint"] {
            defaults.removeObject(forKey: key)
        }

        Task.detached(priority: .utility) {
            guard let baseDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
                return
            }
            let dbDir = baseDir.appendingPathComponent("llmchat", isDirectory: true)
            for item in ["llmchat_online.db", "chat_attachments_encrypted", "sync_meta"] {
                try? FileManager.default.removeItem(at: dbDir.appendingPathComponent(item))
            }
        }
    }
}
