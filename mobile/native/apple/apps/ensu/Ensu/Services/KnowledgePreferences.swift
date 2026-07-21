import Foundation

final class KnowledgePreferences {
    private enum Keys {
        static let enabledDatasetIds = "ensu.knowledge.enabled_dataset_ids"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var enabledDatasetIds: Set<String> {
        Set(defaults.stringArray(forKey: Keys.enabledDatasetIds) ?? [])
    }

    func setDatasetEnabled(id: String, enabled: Bool) {
        var ids = enabledDatasetIds
        if enabled {
            ids.insert(id)
        } else {
            ids.remove(id)
        }
        defaults.set(ids.sorted(), forKey: Keys.enabledDatasetIds)
    }
}
