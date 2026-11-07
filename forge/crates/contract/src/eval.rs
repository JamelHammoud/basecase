use crate::json::{write_number, write_string};
use crate::model::{final_only, Contract, Formula, State, Window, FINAL_ONLY};
use crate::series::{state_series, Polarity};
use crate::trace::Trace;
use std::collections::VecDeque;

const TICK_SLACK: f64 = 1e-9;

#[derive(Debug, Clone, PartialEq)]
pub struct Outcome {
    pub passed: bool,
    pub margin: f64,
    pub worst_at: f64,
    pub failed: Vec<String>,
}

impl Outcome {
    pub fn to_json(&self) -> String {
        let mut out = String::from("{\"passed\":");

        out.push_str(if self.passed { "true" } else { "false" });
        out.push_str(",\"margin\":");
        write_number(&mut out, self.margin);
        out.push_str(",\"worstAt\":");
        write_number(&mut out, self.worst_at);
        out.push_str(",\"failed\":[");

        for (i, label) in self.failed.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }

            write_string(&mut out, label);
        }

        out.push_str("]}");
        out
    }
}

#[derive(Debug, Clone, Copy)]
struct Verdict {
    margin: f64,
    worst: usize,
    done: Option<usize>,
}

fn tick_at_or_after(seconds: f64, dt: f64) -> usize {
    (seconds / dt - TICK_SLACK).ceil() as usize
}

fn tick_at_or_before(seconds: f64, dt: f64) -> usize {
    (seconds / dt + TICK_SLACK).floor() as usize
}

fn window_range(window: &Window, trace: &Trace) -> (usize, usize) {
    let last = trace.ticks - 1;

    match window {
        Window::Whole => (0, last),
        Window::Between(from, to) => (
            tick_at_or_after(*from, trace.dt),
            tick_at_or_before(*to, trace.dt).min(last),
        ),
        Window::Last(seconds) => (
            last.saturating_sub(tick_at_or_before(*seconds, trace.dt)),
            last,
        ),
    }
}

fn clipped(window: &Window, trace: &Trace, start: usize) -> Option<(usize, usize)> {
    let (from, to) = window_range(window, trace);
    let from = from.max(start);

    (from <= to).then_some((from, to))
}

fn first_min(values: &[f64], from: usize) -> (f64, usize) {
    let mut best = (f64::INFINITY, from);

    for (offset, value) in values.iter().enumerate() {
        if *value < best.0 {
            best = (*value, from + offset);
        }
    }

    best
}

fn first_max(values: &[f64], from: usize) -> (f64, usize) {
    let mut best = (f64::NEG_INFINITY, from);

    for (offset, value) in values.iter().enumerate() {
        if *value > best.0 {
            best = (*value, from + offset);
        }
    }

    best
}

fn sliding_minimum(values: &[f64], width: usize) -> Vec<(f64, usize)> {
    let mut queue: VecDeque<usize> = VecDeque::new();
    let mut out = Vec::with_capacity(values.len().saturating_sub(width) + 1);

    for (tick, value) in values.iter().enumerate() {
        while queue.back().is_some_and(|back| values[*back] >= *value) {
            queue.pop_back();
        }

        queue.push_back(tick);

        if queue.front().is_some_and(|front| front + width <= tick) {
            queue.pop_front();
        }

        if tick + 1 >= width {
            let lowest = queue[0];

            out.push((values[lowest], lowest));
        }
    }

    out
}

struct Judge<'a> {
    trace: &'a Trace,
    adverse: f64,
}

impl Judge<'_> {
    fn empty(&self, start: usize) -> Verdict {
        let worst = start.min(self.trace.ticks - 1);

        Verdict {
            margin: self.adverse,
            worst,
            done: (self.adverse > 0.0).then_some(worst),
        }
    }

    fn series(&self, state: &State) -> Vec<f64> {
        state_series(
            state,
            self.trace,
            Polarity {
                negated: false,
                adverse: self.adverse,
            },
        )
    }

    fn always(&self, window: &Window, state: &State, start: usize) -> Verdict {
        let Some((from, to)) = clipped(window, self.trace, start) else {
            return self.empty(start);
        };
        let (margin, worst) = first_min(&self.series(state)[from..=to], from);

        Verdict {
            margin,
            worst,
            done: (margin > 0.0).then_some(to),
        }
    }

    fn eventually(&self, window: &Window, state: &State, start: usize) -> Verdict {
        let Some((from, to)) = clipped(window, self.trace, start) else {
            return self.empty(start);
        };
        let series = self.series(state);
        let values = &series[from..=to];
        let (margin, worst) = first_max(values, from);
        let done = values
            .iter()
            .position(|value| *value > 0.0)
            .map(|offset| from + offset);

        Verdict {
            margin,
            worst,
            done,
        }
    }

    fn hold_for(&self, seconds: f64, state: &State, within: &Window, start: usize) -> Verdict {
        let Some((from, to)) = clipped(within, self.trace, start) else {
            return self.empty(start);
        };
        let width = tick_at_or_after(seconds, self.trace.dt).max(1);

        if to + 1 - from < width {
            return self.empty(from);
        }

        let series = self.series(state);
        let placements = sliding_minimum(&series[from..=to], width);
        let mut best = (f64::NEG_INFINITY, from);
        let mut done = None;

        for (offset, (lowest, tick)) in placements.iter().enumerate() {
            if *lowest > best.0 {
                best = (*lowest, from + tick);
            }

            if done.is_none() && *lowest > 0.0 {
                done = Some(from + offset + width - 1);
            }
        }

        Verdict {
            margin: best.0,
            worst: best.1,
            done,
        }
    }

    fn all(&self, items: &[Formula], start: usize) -> Verdict {
        let mut out = Verdict {
            margin: f64::INFINITY,
            worst: start,
            done: Some(start),
        };

        for item in items {
            let verdict = self.formula(item, start);

            if verdict.margin < out.margin {
                out.margin = verdict.margin;
                out.worst = verdict.worst;
            }

            out.done = out.done.zip(verdict.done).map(|(a, b)| a.max(b));
        }

        out
    }

    fn any(&self, items: &[Formula], start: usize) -> Verdict {
        let mut out = Verdict {
            margin: f64::NEG_INFINITY,
            worst: start,
            done: None,
        };

        for item in items {
            let verdict = self.formula(item, start);

            if verdict.margin > out.margin {
                out.margin = verdict.margin;
                out.worst = verdict.worst;
            }

            out.done = match (out.done, verdict.done) {
                (Some(a), Some(b)) => Some(a.min(b)),
                (a, b) => a.or(b),
            };
        }

        out
    }

    fn sequence(&self, items: &[Formula], start: usize) -> Verdict {
        let mut out = Verdict {
            margin: f64::INFINITY,
            worst: start,
            done: Some(start),
        };

        for item in items {
            let verdict = self.formula(item, out.done.unwrap_or(start));

            if verdict.margin < out.margin {
                out.margin = verdict.margin;
                out.worst = verdict.worst;
            }

            out.done = verdict.done;

            if out.done.is_none() {
                return out;
            }
        }

        out
    }

    fn formula(&self, formula: &Formula, start: usize) -> Verdict {
        match formula {
            Formula::All(items) => self.all(items, start),
            Formula::Any(items) => self.any(items, start),
            Formula::Sequence(items) => self.sequence(items, start),
            Formula::Always(window, state) => self.always(window, state, start),
            Formula::Eventually(window, state) => self.eventually(window, state, start),
            Formula::HoldFor {
                seconds,
                state,
                within,
            } => self.hold_for(*seconds, state, within, start),
        }
    }
}

fn check_signals(contract: &Contract, trace: &Trace) -> Result<(), String> {
    match contract
        .signals()
        .iter()
        .find(|name| !trace.signals.contains_key(*name))
    {
        Some(name) => Err(format!("The trace has no signal named {name}")),
        None => Ok(()),
    }
}

fn is_only_last_tick(window: &Window, trace: &Trace) -> bool {
    let (from, to) = window_range(window, trace);
    let last = trace.ticks - 1;

    from == last && to == last
}

pub fn evaluate(contract: &Contract, trace: &Trace) -> Result<Outcome, String> {
    check_signals(contract, trace)?;

    if final_only(&contract.success, &|window| {
        is_only_last_tick(window, trace)
    }) {
        return Err(String::from(FINAL_ONLY));
    }

    let strict = Judge {
        trace,
        adverse: f64::NEG_INFINITY,
    };
    let wary = Judge {
        trace,
        adverse: f64::INFINITY,
    };
    let success = strict.formula(&contract.success, 0);
    let failed: Vec<String> = contract
        .failures
        .iter()
        .filter(|failure| wary.formula(&failure.formula, 0).margin > 0.0)
        .map(|failure| failure.label.clone())
        .collect();

    Ok(Outcome {
        passed: success.margin > 0.0 && failed.is_empty(),
        margin: success.margin,
        worst_at: trace.time(success.worst),
        failed,
    })
}
