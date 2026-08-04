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

impl From<LogLevel> for log::LevelFilter {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Error => log::LevelFilter::Error,
            LogLevel::Warn => log::LevelFilter::Warn,
            LogLevel::Info => log::LevelFilter::Info,
            LogLevel::Debug => log::LevelFilter::Debug,
            LogLevel::Trace => log::LevelFilter::Trace,
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

pub fn attach_log_stream(max_level: LogLevel, sink: StreamSink<LogEntry>) {
    *SINK.write().unwrap() = Some(sink);
    log::set_max_level(max_level.into());
    let _ = log::set_logger(&LOGGER);
}
