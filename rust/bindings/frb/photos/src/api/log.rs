// TODO: On FRB 2.13, replace this module and the Dart attachment with
// `enable_frb_rust_to_dart_logging!(setup_dart_logging_output = false)`.
// `init_app` must then call `setup_backtrace`, not `setup_default_user_utils`.

use std::sync::{Once, RwLock};

use crate::frb_generated::StreamSink;

pub enum LogLevel {
    Error,
    Warn,
    Info,
}

pub struct LogEntry {
    pub level: LogLevel,
    pub target: String,
    pub message: String,
}

static SINK: RwLock<Option<StreamSink<LogEntry>>> = RwLock::new(None);
static LOGGER: StreamLogger = StreamLogger;
static LOGGER_INIT: Once = Once::new();

struct StreamLogger;

impl log::Log for StreamLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::Level::Info
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let level = match record.level() {
            log::Level::Error => LogLevel::Error,
            log::Level::Warn => LogLevel::Warn,
            log::Level::Info => LogLevel::Info,
            log::Level::Debug | log::Level::Trace => return,
        };
        if let Some(sink) = SINK.read().unwrap().as_ref() {
            let _ = sink.add(LogEntry {
                level,
                target: record.target().to_string(),
                message: record.args().to_string(),
            });
        }
    }

    fn flush(&self) {}
}

pub(crate) fn install() {
    LOGGER_INIT.call_once(|| {
        log::set_logger(&LOGGER).expect("Rust logger already initialized");
        log::set_max_level(log::LevelFilter::Info);
    });
}

pub fn attach_log_stream(sink: StreamSink<LogEntry>) {
    *SINK.write().unwrap() = Some(sink);
    // FRB resets the process-wide maximum after this logger is installed.
    log::set_max_level(log::LevelFilter::Info);
}
