use std::sync::RwLock;

use napi::bindgen_prelude::{FnArgs, Function};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Error, Status};
use napi_derive::napi;

struct LogEntry {
    level: String,
    target: String,
    message: String,
}

type LogSink =
    ThreadsafeFunction<LogEntry, (), FnArgs<(String, String, String)>, Status, false, true>;

static LOGGER: NapiLogger = NapiLogger;
static SINK: RwLock<Option<LogSink>> = RwLock::new(None);

struct NapiLogger;

impl log::Log for NapiLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata())
            && let Some(sink) = SINK.read().unwrap().as_ref()
        {
            sink.call(
                LogEntry {
                    level: record.level().to_string(),
                    target: record.target().to_string(),
                    message: record.args().to_string(),
                },
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        }
    }

    fn flush(&self) {}
}

#[napi]
pub fn init_logging(sink: Function<'_, FnArgs<(String, String, String)>, ()>) -> napi::Result<()> {
    let sink = sink
        .build_threadsafe_function::<LogEntry>()
        .callee_handled::<false>()
        .weak::<true>()
        .build_callback(|ctx| {
            let entry = ctx.value;
            Ok(FnArgs::from((entry.level, entry.target, entry.message)))
        })?;
    log::set_logger(&LOGGER).map_err(|_| Error::from_reason("Rust logger already initialized"))?;
    *SINK.write().unwrap() = Some(sink);
    log::set_max_level(log::LevelFilter::Info);
    Ok(())
}
