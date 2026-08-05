use std::sync::RwLock;

#[derive(uniffi::Enum)]
pub enum RustLogLevel {
    Error,
    Warn,
    Info,
}

#[uniffi::export(callback_interface)]
pub trait RustLogSink: Send + Sync {
    fn log(&self, level: RustLogLevel, target: String, message: String);
}

static LOGGER: UniffiLogger = UniffiLogger;
static SINK: RwLock<Option<Box<dyn RustLogSink>>> = RwLock::new(None);

struct UniffiLogger;

impl ::log::Log for UniffiLogger {
    fn enabled(&self, metadata: &::log::Metadata) -> bool {
        metadata.level() <= ::log::Level::Info
    }

    fn log(&self, record: &::log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let level = match record.level() {
            ::log::Level::Error => RustLogLevel::Error,
            ::log::Level::Warn => RustLogLevel::Warn,
            ::log::Level::Info => RustLogLevel::Info,
            ::log::Level::Debug | ::log::Level::Trace => return,
        };
        if let Some(sink) = SINK.read().unwrap().as_ref() {
            sink.log(
                level,
                record.target().to_string(),
                record.args().to_string(),
            );
        }
    }

    fn flush(&self) {}
}

#[uniffi::export]
pub fn init_rust_logging(sink: Box<dyn RustLogSink>) {
    *SINK.write().unwrap() = Some(sink);
    let _ = ::log::set_logger(&LOGGER);
    ::log::set_max_level(::log::LevelFilter::Info);
}
