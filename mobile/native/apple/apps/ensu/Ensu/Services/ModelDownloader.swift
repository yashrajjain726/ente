import BackgroundTasks
import Foundation

private let logger = EnsuLogging.shared.logger("ModelDownloader")

extension ModelDownloader {
    convenience init() {
        let baseDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let modelsDir = baseDir.appendingPathComponent("models", isDirectory: true)
        self.init(
            modelsDir: modelsDir.path,
            legacyDir: baseDir.appendingPathComponent("llm", isDirectory: true).path
        )
        migrate()
        var excludedDir = modelsDir
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
        URL(fileURLWithPath: modelPath(target: target.rustTarget))
    }

    func mmprojPath(for target: LlmModelTarget) -> URL? {
        mmprojPath(target: target.rustTarget).map(URL.init(fileURLWithPath:))
    }

    func isDownloaded(target: LlmModelTarget) -> Bool {
        isDownloaded(target: target.rustTarget)
    }

    func estimatedDownloadSize(target: LlmModelTarget) async -> Int64? {
        let rustTarget = target.rustTarget
        return await Task.detached(priority: .utility) {
            self.estimatedDownloadSize(target: rustTarget)
        }.value
    }

    func removeDownloaded(target: LlmModelTarget) -> Bool {
        removeDownloaded(target: target.rustTarget)
    }

    @discardableResult
    func download(
        target: LlmModelTarget,
        onProgress: @escaping (DownloadProgress) -> Void
    ) async throws -> Bool {
        let rustTarget = target.rustTarget
        migrate()
        if isDownloaded(target: rustTarget) {
            return false
        }

        onProgress(DownloadProgress(percent: 0, status: "Starting download..."))

        if #available(iOS 26.0, *) {
            ModelDownloadBackgroundTask.begin { [weak self] in
                self?.cancel()
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
                    logDownloadMetrics(progress)
                    if #available(iOS 26.0, *) {
                        ModelDownloadBackgroundTask.update(
                            downloadedBytes: progress.downloadedBytes,
                            totalBytes: progress.totalBytes
                        )
                    }
                    onProgress(progress.toInferenceProgress())
                },
                isCancelled: { Task.isCancelled }
            )
            _ = try self.download(target: rustTarget, callback: callback)
        }

        try await withTaskCancellationHandler {
            try await downloadTask.value
        } onCancel: {
            self.cancel()
            downloadTask.cancel()
        }
        return true
    }
}

private extension LlmModelTarget {
    var rustTarget: ModelTarget {
        ModelTarget(id: id, url: url, mmprojUrl: mmprojUrl)
    }
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
