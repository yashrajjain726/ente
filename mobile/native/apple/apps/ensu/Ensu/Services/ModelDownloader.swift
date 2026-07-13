import BackgroundTasks
import CryptoKit
import Foundation

final class ModelDownloader {
    private struct DownloadTarget {
        let label: String
        let url: String
        let destination: URL
    }

    private let modelDir: URL
    private let cancelLock = NSLock()
    private var cancelled = false
    private let logger = EnsuLogging.shared.logger("ModelDownloader")

    init() {
        let baseDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        modelDir = baseDir.appendingPathComponent("models", isDirectory: true)
        Self.migrateLegacyModels(
            from: baseDir.appendingPathComponent("llm", isDirectory: true),
            to: modelDir
        )
        try? FileManager.default.createDirectory(at: modelDir, withIntermediateDirectories: true, attributes: nil)
        var excludedDir = modelDir
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? excludedDir.setResourceValues(values)
    }

    static func registerBackgroundTask() {
        if #available(iOS 26.0, *) {
            ModelDownloadBackgroundTask.register()
        }
    }

    func modelPath(for target: LlmModelTarget) -> URL {
        let filename = URL(string: target.url)?.lastPathComponent ?? "model.gguf"
        if target.id.hasPrefix("custom:") {
            let custom = modelDir.appendingPathComponent("custom", isDirectory: true)
            return custom.appendingPathComponent("\(hash(target.url))_\(filename)")
        }
        return modelDir.appendingPathComponent(filename)
    }

    func mmprojPath(for target: LlmModelTarget) -> URL? {
        guard let url = target.mmprojUrl else { return nil }
        let filename = URL(string: url)?.lastPathComponent ?? "mmproj.gguf"
        if target.id.hasPrefix("custom:") {
            let custom = modelDir.appendingPathComponent("custom", isDirectory: true)
            return custom.appendingPathComponent("\(hash(url))_\(filename)")
        }
        return modelDir.appendingPathComponent(filename)
    }

    func isDownloaded(target: LlmModelTarget) -> Bool {
        let modelPath = modelPath(for: target)
        if !FileManager.default.fileExists(atPath: modelPath.path) {
            return false
        }
        if let mmprojPath = mmprojPath(for: target),
           let mmprojUrl = target.mmprojUrl,
           !mmprojUrl.isEmpty,
           !FileManager.default.fileExists(atPath: mmprojPath.path) {
            return false
        }
        return true
    }

    func estimatedDownloadSize(target: LlmModelTarget) async -> Int64? {
        let modelPath = modelPath(for: target)
        let mmprojPath = mmprojPath(for: target)
        let modelSize: Int64?
        if FileManager.default.fileExists(atPath: modelPath.path) {
            modelSize = fileSize(modelPath)
        } else {
            modelSize = await fetchContentLength(for: target.url)
        }

        let mmprojSize: Int64?
        if let mmprojUrl = target.mmprojUrl, !mmprojUrl.isEmpty, let mmprojPath {
            if FileManager.default.fileExists(atPath: mmprojPath.path) {
                mmprojSize = fileSize(mmprojPath)
            } else {
                mmprojSize = await fetchContentLength(for: mmprojUrl)
            }
        } else {
            mmprojSize = nil
        }

        let sizes = [modelSize, mmprojSize].compactMap { $0 }.filter { $0 > 0 }
        if sizes.isEmpty {
            return nil
        }
        return sizes.reduce(0, +)
    }

    func cancel() {
        setCancelled(true)
    }

    func removeDownloaded(target: LlmModelTarget) -> Bool {
        var removedAny = false
        let modelPath = modelPath(for: target)
        if FileManager.default.fileExists(atPath: modelPath.path) {
            try? FileManager.default.removeItem(at: modelPath)
            removedAny = true
        }
        if let mmprojPath = mmprojPath(for: target), FileManager.default.fileExists(atPath: mmprojPath.path) {
            try? FileManager.default.removeItem(at: mmprojPath)
            removedAny = true
        }
        return removedAny
    }

    @discardableResult
    func download(
        target: LlmModelTarget,
        onProgress: @escaping (DownloadProgress) -> Void
    ) async throws -> Bool {
        var expectedTargets: [DownloadTarget] = []
        let modelPath = modelPath(for: target)
        let modelExistsAtStart = FileManager.default.fileExists(atPath: modelPath.path)
        if shouldRedownloadExistingFile(at: modelPath) || !modelExistsAtStart {
            if modelExistsAtStart {
                try? FileManager.default.removeItem(at: modelPath)
            }
        }
        expectedTargets.append(DownloadTarget(label: "Model", url: target.url, destination: modelPath))

        if let mmprojUrl = target.mmprojUrl, !mmprojUrl.isEmpty, let mmprojPath = mmprojPath(for: target) {
            let mmprojExistsAtStart = FileManager.default.fileExists(atPath: mmprojPath.path)
            if shouldRedownloadExistingFile(at: mmprojPath) || !mmprojExistsAtStart {
                if mmprojExistsAtStart {
                    try? FileManager.default.removeItem(at: mmprojPath)
                }
            }
            expectedTargets.append(DownloadTarget(label: "Mmproj", url: mmprojUrl, destination: mmprojPath))
        }

        let downloads = expectedTargets.filter { !FileManager.default.fileExists(atPath: $0.destination.path) }
        if downloads.isEmpty {
            return false
        }

        onProgress(DownloadProgress(percent: 0, status: "Starting download..."))
        try await downloadWithRust(expectedTargets, onProgress: onProgress)
        return true
    }

    private func downloadWithRust(
        _ expectedTargets: [DownloadTarget],
        onProgress: @escaping (DownloadProgress) -> Void
    ) async throws {
        setCancelled(false)
        let targets = expectedTargets.map {
            LlmModelDownloadTarget(label: $0.label, url: $0.url, destinationPath: $0.destination.path)
        }

        if #available(iOS 26.0, *) {
            ModelDownloadBackgroundTask.begin { [weak self] in
                self?.setCancelled(true)
            }
        }
        defer {
            if #available(iOS 26.0, *) {
                ModelDownloadBackgroundTask.end()
            }
        }

        let downloadTask = Task.detached(priority: .utility) { [weak self] in
            guard let self else { return }
            let callback = ModelDownloadCallbackSink(
                onProgress: { progress in
                    self.logDownloadMetrics(progress)
                    if #available(iOS 26.0, *) {
                        ModelDownloadBackgroundTask.update(
                            downloadedBytes: progress.downloadedBytes,
                            totalBytes: progress.totalBytes
                        )
                    }
                    onProgress(progress.toInferenceProgress())
                },
                isCancelled: { [weak self] in
                    (self?.isCancelled() ?? true) || Task.isCancelled
                }
            )
            try llmDownloadModelFiles(targets: targets, callback: callback)
        }

        try await withTaskCancellationHandler {
            try await downloadTask.value
        } onCancel: {
            self.setCancelled(true)
            downloadTask.cancel()
        }
    }

    private static func migrateLegacyModels(from legacyDir: URL, to modelDir: URL) {
        let fileManager = FileManager.default
        let legacyModels = legacyDir.appendingPathComponent("models", isDirectory: true)
        var migrated = true
        if fileManager.fileExists(atPath: legacyModels.path) {
            if fileManager.fileExists(atPath: modelDir.path) {
                migrated = false
            } else {
                migrated = (try? fileManager.moveItem(at: legacyModels, to: modelDir)) != nil
            }
        }
        if migrated {
            try? fileManager.removeItem(at: legacyDir)
        }
    }

    private func shouldRedownloadExistingFile(at url: URL) -> Bool {
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        let size = fileSize(url)
        if size <= 0 {
            return true
        }
        return !url.looksLikeGgufFile
    }

    private func fetchContentLength(for urlString: String) async -> Int64? {
        guard let url = URL(string: urlString) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                return nil
            }
            if response.expectedContentLength > 0 {
                return response.expectedContentLength
            }
            if let http = response as? HTTPURLResponse,
               let header = http.value(forHTTPHeaderField: "Content-Length"),
               let length = Int64(header) {
                return length
            }
        } catch {
            return nil
        }
        return nil
    }

    private func fileSize(_ url: URL) -> Int64 {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        return (attrs?[.size] as? NSNumber)?.int64Value ?? 0
    }

    private func hash(_ value: String) -> String {
        let data = Data(value.utf8)
        let hashed = SHA256.hash(data: data)
        return hashed.map { String(format: "%02x", $0) }.joined()
    }

    private func setCancelled(_ value: Bool) {
        cancelLock.lock()
        cancelled = value
        cancelLock.unlock()
    }

    private func isCancelled() -> Bool {
        cancelLock.lock()
        let value = cancelled
        cancelLock.unlock()
        return value
    }

    private func logDownloadMetrics(_ progress: LlmModelDownloadProgress) {
        if progress.fileComplete {
            logger.info(
                "Model download file complete",
                details: "label=\(progress.label) bytes=\(progress.fileDownloadedBytes) elapsedMs=\(progress.fileElapsedMs) rate=\(formatRate(progress.fileBytesPerSecond)) retries=\(progress.fileRetryCount)"
            )
        }
        if progress.complete {
            logger.info(
                "Model download complete",
                details: "bytes=\(progress.downloadedBytes) elapsedMs=\(progress.elapsedMs) rate=\(formatRate(progress.bytesPerSecond)) retries=\(progress.retryCount)"
            )
        }
    }

    private func formatRate(_ bytesPerSecond: Double) -> String {
        guard bytesPerSecond.isFinite, bytesPerSecond > 0 else {
            return "0 B/s"
        }
        return "\(Int64(bytesPerSecond).formattedFileSize)/s"
    }
}

private final class ModelDownloadCallbackSink: LlmModelDownloadCallback, @unchecked Sendable {
    private let onProgressHandler: (LlmModelDownloadProgress) -> Void
    private let isCancelledHandler: () -> Bool

    init(
        onProgress: @escaping (LlmModelDownloadProgress) -> Void,
        isCancelled: @escaping () -> Bool
    ) {
        self.onProgressHandler = onProgress
        self.isCancelledHandler = isCancelled
    }

    func onProgress(progress: LlmModelDownloadProgress) {
        onProgressHandler(progress)
    }

    func isCancelled() -> Bool {
        isCancelledHandler()
    }
}

private extension LlmModelDownloadProgress {
    func toInferenceProgress() -> DownloadProgress {
        let total = totalBytes.flatMap { $0 > 0 ? $0 : nil }
        let percent: Int
        let status: String
        if let total {
            percent = min(99, max(0, Int((Double(downloadedBytes) / Double(total)) * 100.0)))
            status = "Downloading... \(downloadedBytes.formattedFileSize) / \(total.formattedFileSize)"
        } else if fileDownloadedBytes > 0 {
            percent = 0
            status = "Downloading \(label.lowercased())... \(fileDownloadedBytes.formattedFileSize)"
        } else {
            percent = 0
            status = "Downloading \(label.lowercased())..."
        }
        return DownloadProgress(percent: percent, status: status)
    }
}

extension URL {
    var looksLikeGgufFile: Bool {
        guard let handle = try? FileHandle(forReadingFrom: self) else { return false }
        let data = handle.readData(ofLength: 4)
        try? handle.close()
        guard data.count == 4 else { return false }
        return String(decoding: data, as: UTF8.self) == "GGUF"
    }
}

@available(iOS 26.0, *)
private enum ModelDownloadBackgroundTask {
    private static let identifier = "io.ente.ensu.model-download"
    private static let lock = NSLock()
    private static var task: BGContinuedProcessingTask?
    private static var onExpiration: (() -> Void)?
    private static var downloadActive = false

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { bgTask in
            guard let bgTask = bgTask as? BGContinuedProcessingTask else {
                bgTask.setTaskCompleted(success: false)
                return
            }
            adopt(bgTask)
        }
    }

    static func begin(onExpiration: @escaping () -> Void) {
        lock.lock()
        downloadActive = true
        Self.onExpiration = onExpiration
        lock.unlock()

        let request = BGContinuedProcessingTaskRequest(
            identifier: identifier,
            title: "Downloading model",
            subtitle: ""
        )
        request.strategy = .fail
        try? BGTaskScheduler.shared.submit(request)
    }

    static func update(downloadedBytes: Int64, totalBytes: Int64?) {
        lock.lock()
        let task = task
        lock.unlock()
        guard let task, let totalBytes, totalBytes > 0 else { return }
        task.progress.totalUnitCount = totalBytes
        task.progress.completedUnitCount = min(downloadedBytes, totalBytes)
    }

    static func end() {
        lock.lock()
        downloadActive = false
        onExpiration = nil
        let task = task
        Self.task = nil
        lock.unlock()
        task?.setTaskCompleted(success: true)
    }

    private static func adopt(_ bgTask: BGContinuedProcessingTask) {
        lock.lock()
        guard downloadActive else {
            lock.unlock()
            bgTask.setTaskCompleted(success: true)
            return
        }
        task = bgTask
        lock.unlock()

        bgTask.expirationHandler = {
            lock.lock()
            let expired = task === bgTask
            let handler = onExpiration
            if expired {
                task = nil
            }
            lock.unlock()
            if expired {
                handler?()
                bgTask.setTaskCompleted(success: false)
            }
        }
    }
}
