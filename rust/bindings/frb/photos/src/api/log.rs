use std::sync::{Mutex, Once};

use crate::frb_generated::StreamSink;

#[derive(Clone, Copy)]
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

static SINKS: Mutex<Vec<StreamSink<LogEntry>>> = Mutex::new(Vec::new());
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
        let mut sinks = SINKS.lock().unwrap();
        while let Some(sink) = sinks.first() {
            if sink
                .add(LogEntry {
                    level,
                    target: record.target().to_string(),
                    message: record.args().to_string(),
                })
                .is_ok()
            {
                break;
            }
            sinks.remove(0);
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
    SINKS.lock().unwrap().push(sink);
    log::set_max_level(log::LevelFilter::Info);
}
