// TODO: This entire file, and the apps' attach fns, get replaced by frb's
// `enable_frb_rust_to_dart_logging!` once frb 2.13 is out.

use std::sync::RwLock;

use crate::frb_generated::StreamSink;

pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl From<log::Level> for LogLevel {
    fn from(level: log::Level) -> Self {
        match level {
            log::Level::Error => LogLevel::Error,
            log::Level::Warn => LogLevel::Warn,
            log::Level::Info => LogLevel::Info,
            log::Level::Debug => LogLevel::Debug,
            log::Level::Trace => LogLevel::Trace,
        }
    }
}

pub struct LogEntry {
    pub level: LogLevel,
    pub target: String,
    pub message: String,
}

static SINK: RwLock<Option<StreamSink<LogEntry>>> = RwLock::new(None);
static LOGGER: StreamLogger = StreamLogger;

struct StreamLogger;

impl log::Log for StreamLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        if let Some(sink) = SINK.read().unwrap().as_ref() {
            let _ = sink.add(LogEntry {
                level: record.level().into(),
                target: record.target().to_string(),
                message: record.args().to_string(),
            });
        }
    }

    fn flush(&self) {}
}

pub(crate) fn install() {
    if log::set_logger(&LOGGER).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
}

pub fn attach_log_stream(sink: StreamSink<LogEntry>) {
    *SINK.write().unwrap() = Some(sink);
    // FRB resets the process-wide maximum after this logger is installed.
    log::set_max_level(log::LevelFilter::Info);
}
