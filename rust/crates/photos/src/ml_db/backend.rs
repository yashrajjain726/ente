use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    Dart,
    Rust,
}

static BACKEND: OnceLock<Backend> = OnceLock::new();

pub fn decide(prefer_rust: bool) -> Backend {
    decide_with(&BACKEND, prefer_rust)
}

fn decide_with(latch: &OnceLock<Backend>, prefer_rust: bool) -> Backend {
    *latch.get_or_init(|| {
        if prefer_rust {
            Backend::Rust
        } else {
            Backend::Dart
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_decision_wins() {
        let latch = OnceLock::new();
        assert_eq!(decide_with(&latch, true), Backend::Rust);
        assert_eq!(decide_with(&latch, false), Backend::Rust);
        assert_eq!(decide_with(&latch, true), Backend::Rust);
    }

    #[test]
    fn dart_stays_latched() {
        let latch = OnceLock::new();
        assert_eq!(decide_with(&latch, false), Backend::Dart);
        assert_eq!(decide_with(&latch, true), Backend::Dart);
    }

    #[test]
    fn process_latch_is_stable() {
        let first = decide(false);
        assert_eq!(decide(true), first);
        assert_eq!(decide(false), first);
    }
}
