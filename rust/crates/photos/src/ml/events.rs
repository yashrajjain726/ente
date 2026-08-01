//! Reports graceful ML fallbacks and quarantines that would otherwise be
//! invisible to the app because the calling operation still succeeds.

use std::sync::Mutex;

/// Prefer recent, actionable events when the app has not drained the buffer.
const MAX_BUFFERED_EVENTS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Severity {
    Info,
    Warning,
    Severe,
}

impl Severity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Severe => "severe",
        }
    }
}

#[derive(Clone, Debug)]
pub struct MlRuntimeEvent {
    pub severity: Severity,
    pub message: String,
}

static EVENTS: Mutex<Vec<MlRuntimeEvent>> = Mutex::new(Vec::new());

pub(crate) fn record(severity: Severity, message: String) {
    crate::ml::runtime::rt_log(&format!("[{}] {message}", severity.as_str()));
    let mut events = EVENTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if events
        .iter()
        .any(|event| event.severity == severity && event.message == message)
    {
        return;
    }
    if events.len() >= MAX_BUFFERED_EVENTS {
        events.remove(0);
    }
    events.push(MlRuntimeEvent { severity, message });
}

pub fn take_events() -> Vec<MlRuntimeEvent> {
    let mut events = EVENTS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::take(&mut *events)
}

#[cfg(test)]
mod tests {
    use super::{MAX_BUFFERED_EVENTS, Severity, record, take_events};

    /// A single test because the buffer is a process-global shared with any
    /// concurrently running test that records events.
    #[test]
    fn records_in_order_drains_on_take_and_drops_oldest_when_full() {
        take_events();
        record(Severity::Info, "first".to_string());
        record(Severity::Severe, "second".to_string());

        let events = take_events();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].severity, Severity::Info);
        assert_eq!(events[0].message, "first");
        assert_eq!(events[1].severity, Severity::Severe);
        assert!(take_events().is_empty());

        record(Severity::Warning, "duplicate".to_string());
        record(Severity::Warning, "duplicate".to_string());
        let events = take_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].message, "duplicate");

        for index in 0..(MAX_BUFFERED_EVENTS + 3) {
            record(Severity::Info, format!("event {index}"));
        }
        let events = take_events();
        assert_eq!(events.len(), MAX_BUFFERED_EVENTS);
        assert_eq!(events[0].message, "event 3");
    }
}
