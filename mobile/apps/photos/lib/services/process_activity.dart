import "package:shared_preferences/shared_preferences.dart";

const kLastBGTaskHeartBeatTime = "bg_task_hb_time";
const kLastFGTaskHeartBeatTime = "fg_task_hb_time";
const kFGTaskDeathTimeoutInMicroseconds = 5000000;

/// Whether the foreground engine has written its heartbeat within the last
/// five seconds. Reloads prefs so writes from the other engine are seen.
///
/// Heartbeats influence priority and yield latency only — never correctness.
Future<bool> isForegroundEngineActive() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.reload();
  final currentTime = DateTime.now().microsecondsSinceEpoch;
  final lastFGHeartBeatTime = prefs.getInt(kLastFGTaskHeartBeatTime) ?? 0;
  return lastFGHeartBeatTime >
      (currentTime - kFGTaskDeathTimeoutInMicroseconds);
}
