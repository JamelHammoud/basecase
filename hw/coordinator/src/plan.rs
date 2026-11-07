use crate::cond::Instr;

pub const END: i32 = -1;
pub const ABANDON: i32 = -2;

pub const MAX_OPS: usize = 4096;
pub const MAX_FACTS: usize = 256;
pub const MAX_WATCHERS: usize = 32;
pub const MAX_REACTIONS: usize = 64;
pub const MAX_SKILLS: usize = 1024;
pub const MAX_FIBERS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LoadError(pub &'static str);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Interrupt {
    Any,
    AtPhase,
    Never,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Retrigger {
    Ignore,
    Restart,
    Queue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Skill {
    pub holds: u8,
    pub interrupt: Interrupt,
    pub stop_via: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: u16,
    pub len: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpKind {
    Do {
        skill: u16,
        holds: u8,
    },
    Say {
        text: i32,
        needs: Span,
    },
    Infer {
        fact: u16,
    },
    Ask {
        fact: u16,
        answers: Span,
    },
    If {
        test: u16,
        then: i32,
        otherwise: i32,
    },
    Wait {
        until: i32,
        ms: u32,
    },
    Together {
        branches: Span,
        any: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Op {
    pub kind: OpKind,
    pub next: i32,
    pub on_timeout: i32,
    pub on_fail: i32,
    pub timeout_ms: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reaction {
    pub when: u16,
    pub cooldown_ms: u32,
    pub retrigger: Retrigger,
    pub stop_first: bool,
    pub entry: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Base {
    pub skill: u16,
    pub timeout_ms: u32,
    pub on_timeout: i32,
    pub on_fail: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Plan {
    pub fact_ages: Vec<u32>,
    pub conds: Vec<Span>,
    pub instrs: Vec<Instr>,
    pub skills: Vec<Skill>,
    pub ops: Vec<Op>,
    pub reactions: Vec<Reaction>,
    pub watcher_whens: Vec<i32>,
    pub flat: Vec<i32>,
    pub base: Base,
    pub safe_stop: u16,
    pub stop_timeout_ms: u32,
    pub control_deadline_ms: u32,
}

impl Plan {
    pub fn op(&self, pc: i32) -> Option<Op> {
        self.ops.get(usize::try_from(pc).ok()?).copied()
    }

    pub fn skill(&self, index: u16) -> Option<Skill> {
        self.skills.get(usize::from(index)).copied()
    }

    pub fn cond_code(&self, index: u16) -> &[Instr] {
        let Some(span) = self.conds.get(usize::from(index)) else {
            return &[];
        };
        let start = usize::from(span.start);

        self.instrs
            .get(start..start + usize::from(span.len))
            .unwrap_or(&[])
    }

    pub fn flat_at(&self, span: Span, offset: u16) -> Option<i32> {
        self.flat
            .get(usize::from(span.start) + usize::from(offset))
            .copied()
    }
}
