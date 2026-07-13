import BackgroundTasks
import Foundation

@available(iOS 26.0, *)
enum ModelDownloadBackgroundTask {
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
