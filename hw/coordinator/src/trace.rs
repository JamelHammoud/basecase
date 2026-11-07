use std::fmt::Write;

const CAPACITY: usize = 256;
const ROOM_FOR_ONE_EVENT: usize = 200;
const JSON_BYTES: usize = CAPACITY * ROOM_FOR_ONE_EVENT + 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Started,
    Run,
    Release,
    Fired,
    Dropped,
    Queued,
    Restarted,
    Preempted,
    Ended,
    OpStart,
    OpDone,
    OpTimeout,
    OpFail,
    OpCancel,
    Branch,
    Leaf,
    Stale,
    Fresh,
    Watcher,
    BaseEnd,
    SafeStop,
}

impl EventKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Started => "started",
            Self::Run => "run",
            Self::Release => "release",
            Self::Fired => "fired",
            Self::Dropped => "dropped",
            Self::Queued => "queued",
            Self::Restarted => "restarted",
            Self::Preempted => "preempted",
            Self::Ended => "ended",
            Self::OpStart => "opStart",
            Self::OpDone => "opDone",
            Self::OpTimeout => "opTimeout",
            Self::OpFail => "opFail",
            Self::OpCancel => "opCancel",
            Self::Branch => "branch",
            Self::Leaf => "leaf",
            Self::Stale => "stale",
            Self::Fresh => "fresh",
            Self::Watcher => "watcher",
            Self::BaseEnd => "baseEnd",
            Self::SafeStop => "safeStop",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Event {
    pub t: u64,
    pub kind: EventKind,
    pub a: i32,
    pub b: i32,
    pub c: i32,
    pub v: f64,
}

#[derive(Debug)]
pub struct Trace {
    events: Vec<Event>,
    lost: u32,
    json: Vec<u8>,
}

impl Default for Trace {
    fn default() -> Self {
        Self::new()
    }
}

struct Cursor<'a> {
    buf: &'a mut [u8],
    at: usize,
}

impl Write for Cursor<'_> {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        let end = self.at.checked_add(s.len()).ok_or(std::fmt::Error)?;
        let room = self.buf.get_mut(self.at..end).ok_or(std::fmt::Error)?;

        room.copy_from_slice(s.as_bytes());
        self.at = end;

        Ok(())
    }
}

impl Trace {
    pub fn new() -> Self {
        Self {
            events: Vec::with_capacity(CAPACITY),
            lost: 0,
            json: vec![0; JSON_BYTES],
        }
    }

    pub fn push(&mut self, event: Event) {
        if self.events.len() < CAPACITY {
            self.events.push(event);
        } else {
            self.lost = self.lost.saturating_add(1);
        }
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn events(&self) -> &[Event] {
        &self.events
    }

    pub fn clear(&mut self) {
        self.events.clear();
        self.lost = 0;
    }

    pub fn json_ptr(&self) -> *const u8 {
        self.json.as_ptr()
    }

    pub fn drain_json(&mut self) -> usize {
        let mut out = Cursor {
            buf: &mut self.json,
            at: 0,
        };
        let written = write_events(&mut out, &self.events, self.lost).is_ok();
        let length = if written { out.at } else { 0 };

        self.clear();

        length
    }

    pub fn json_bytes(&self, length: usize) -> &[u8] {
        self.json.get(..length).unwrap_or(&[])
    }
}

fn write_events(out: &mut Cursor, events: &[Event], lost: u32) -> std::fmt::Result {
    out.write_char('[')?;

    for (i, event) in events.iter().enumerate() {
        if i > 0 {
            out.write_char(',')?;
        }

        write_event(out, event)?;
    }

    if lost > 0 {
        let separator = if events.is_empty() { "" } else { "," };

        write!(
            out,
            "{separator}{{\"t\":0,\"k\":\"lost\",\"a\":{lost},\"b\":0,\"c\":0,\"v\":0}}"
        )?;
    }

    out.write_char(']')
}

fn write_event(out: &mut Cursor, event: &Event) -> std::fmt::Result {
    let v = if event.v.is_finite() { event.v } else { 0.0 };

    write!(
        out,
        "{{\"t\":{},\"k\":\"{}\",\"a\":{},\"b\":{},\"c\":{},\"v\":{:e}}}",
        event.t,
        event.kind.name(),
        event.a,
        event.b,
        event.c,
        v
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    fn event(t: u64, v: f64) -> Event {
        Event {
            t,
            kind: EventKind::Leaf,
            a: 1,
            b: -2,
            c: 3,
            v,
        }
    }

    #[test]
    fn writes_valid_json_for_any_number() {
        let mut trace = Trace::new();

        trace.push(event(5, 0.83));
        trace.push(event(u64::MAX, f64::MAX));
        trace.push(event(0, f64::NAN));

        let length = trace.drain_json();
        let text = std::str::from_utf8(trace.json_bytes(length)).unwrap();
        let parsed = json::parse(text).unwrap();
        let items = parsed.as_arr().unwrap();

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].get("v").unwrap().as_f64(), Some(0.83));
        assert_eq!(items[2].get("v").unwrap().as_f64(), Some(0.0));
        assert_eq!(items[0].get("k").unwrap().as_str(), Some("leaf"));
        assert!(trace.is_empty());
    }

    #[test]
    fn counts_events_past_the_capacity_and_says_so() {
        let mut trace = Trace::new();

        for _ in 0..(CAPACITY + 3) {
            trace.push(event(1, 1.0));
        }

        assert_eq!(trace.len(), CAPACITY);

        let length = trace.drain_json();
        let text = std::str::from_utf8(trace.json_bytes(length)).unwrap();
        let parsed = json::parse(text).unwrap();
        let last = parsed.as_arr().unwrap().last().unwrap();

        assert_eq!(last.get("k").unwrap().as_str(), Some("lost"));
        assert_eq!(last.get("a").unwrap().as_f64(), Some(3.0));
    }
}
