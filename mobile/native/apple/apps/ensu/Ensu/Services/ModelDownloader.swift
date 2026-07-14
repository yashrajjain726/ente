import BackgroundTasks
import Foundation

private let logger = EnsuLogging.shared.logger("ModelDownloader")

final class ModelDownloader {
    private let core: ModelDownloadCore

    init() {
        let baseDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let modelsDir = baseDir.appendingPathComponent("models", isDirectory: true)
        core = ModelDownloadCore(
            modelsDir: modelsDir.path,
            legacyDir: baseDir.appendingPathComponent("llm", isDirectory: true).path
        )
        core.migrate()
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

    func modelPath(target: ModelDownloadTarget) -> URL {
        URL(fileURLWithPath: core.modelPath(target: target))
    }

    func mmprojPath(target: ModelDownloadTarget) -> String? {
        core.mmprojPath(target: target)
    }

    func isDownloaded(target: ModelDownloadTarget) -> Bool {
        core.isDownloaded(target: target)
    }

    func removeDownloaded(target: ModelDownloadTarget) -> Bool {
        core.removeDownloaded(target: target)
    }

    func cancel() {
        core.cancel()
    }

    func estimateDownloadSize(target: ModelDownloadTarget) async -> Int64? {
        await Task.detached(priority: .utility) { [core] in
            core.estimatedDownloadSize(target: target)
        }.value
    }

    @discardableResult
    func download(
        target: ModelDownloadTarget,
        onProgress: @escaping (DownloadProgress) -> Void
    ) async throws -> Bool {
        core.migrate()
        if core.isDownloaded(target: target) {
            return false
        }

        onProgress(DownloadProgress(percent: 0, status: "Starting download..."))

        if #available(iOS 26.0, *) {
            ModelDownloadBackgroundTask.begin { [core] in
                core.cancel()
            }
        }
        defer {
            if #available(iOS 26.0, *) {
                ModelDownloadBackgroundTask.end()
            }
        }

        let core = core
        let downloadTask = Task.detached(priority: .utility) {
            let callback = ModelDownloadCallbackSink(
                onProgress: { progress in
                    if let line = progress.logLine {
                        logger.info(line)
                    }
                    if #available(iOS 26.0, *) {
                        ModelDownloadBackgroundTask.update(
                            downloadedBytes: progress.downloadedBytes,
                            totalBytes: progress.totalBytes
                        )
                    }
                    onProgress(DownloadProgress(percent: Int(progress.percent), status: progress.status))
                },
                isCancelled: { Task.isCancelled }
            )
            _ = try core.download(target: target, callback: callback)
        }

        try await withTaskCancellationHandler {
            try await downloadTask.value
        } onCancel: {
            core.cancel()
            downloadTask.cancel()
        }
        return true
    }
}

private final class ModelDownloadCallbackSink: ModelDownloadCallback, @unchecked Sendable {
    private let onProgressHandler: (ModelDownloadProgress) -> Void
    private let isCancelledHandler: () -> Bool

    init(
        onProgress: @escaping (ModelDownloadProgress) -> Void,
        isCancelled: @escaping () -> Bool
    ) {
        self.onProgressHandler = onProgress
        self.isCancelledHandler = isCancelled
    }

    func onProgress(progress: ModelDownloadProgress) {
        onProgressHandler(progress)
    }

    func isCancelled() -> Bool {
        isCancelledHandler()
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
