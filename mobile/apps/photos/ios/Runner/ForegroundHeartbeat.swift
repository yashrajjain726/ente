import Foundation

final class ForegroundHeartbeat {
  private let defaults = UserDefaults.standard
  private var timer: Timer?
  private var nativeHeartbeatStartedAt: Int64 = 0

  func start() {
    guard timer == nil else {
      return
    }

    nativeHeartbeatStartedAt = currentTimeInMicroseconds()
    writeNativeHeartbeat(nativeHeartbeatStartedAt)

    let timer = Timer(timeInterval: heartbeatInterval, repeats: true) { [weak self] _ in
      self?.heartbeatTimerFired()
    }
    self.timer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  func stop() {
    timer?.invalidate()
    timer = nil
  }

  private func heartbeatTimerFired() {
    if hasDartHeartbeatTakenOver() {
      stop()
      return
    }
    writeNativeHeartbeat(currentTimeInMicroseconds())
  }

  private func hasDartHeartbeatTakenOver() -> Bool {
    let dartHeartbeat =
      (defaults.object(forKey: dartForegroundHeartbeatKey) as? NSNumber)?.int64Value ?? 0
    return dartHeartbeat >= nativeHeartbeatStartedAt
  }

  private func writeNativeHeartbeat(_ heartbeat: Int64) {
    defaults.set(heartbeat, forKey: nativeForegroundHeartbeatKey)
  }

  private func currentTimeInMicroseconds() -> Int64 {
    Int64(Date().timeIntervalSince1970 * 1_000_000)
  }

  private let dartForegroundHeartbeatKey = "flutter.fg_task_hb_time"
  private let nativeForegroundHeartbeatKey = "flutter.native_fg_task_hb_time"
  private let heartbeatInterval: TimeInterval = 1
}
