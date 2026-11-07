use crate::facts::{FactStore, FactView};

pub const MAX_STACK: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Instr {
    EqNum { fact: u16, value: f64 },
    EqSym { fact: u16, value: i32 },
    AtLeast { fact: u16, value: f64 },
    AtMost { fact: u16, value: f64 },
    All { count: u8 },
    Any { count: u8 },
    Not,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tri {
    False,
    True,
    Unknown,
}

impl Tri {
    fn from_bool(value: bool) -> Self {
        if value {
            Tri::True
        } else {
            Tri::False
        }
    }

    fn invert(self) -> Self {
        match self {
            Tri::True => Tri::False,
            Tri::False => Tri::True,
            Tri::Unknown => Tri::Unknown,
        }
    }

    pub fn code(self) -> i32 {
        match self {
            Tri::False => 0,
            Tri::True => 1,
            Tri::Unknown => 2,
        }
    }
}

fn leaf(view: FactView, test: bool) -> Tri {
    if view.fresh {
        Tri::from_bool(test)
    } else {
        Tri::Unknown
    }
}

fn combine(items: &[Tri], dominant: Tri) -> Tri {
    if items.contains(&dominant) {
        dominant
    } else if items.contains(&Tri::Unknown) {
        Tri::Unknown
    } else {
        dominant.invert()
    }
}

struct Stack {
    items: [Tri; MAX_STACK],
    len: usize,
}

impl Stack {
    fn push(&mut self, value: Tri) -> Option<()> {
        *self.items.get_mut(self.len)? = value;
        self.len += 1;

        Some(())
    }

    fn pop(&mut self) -> Option<Tri> {
        self.len = self.len.checked_sub(1)?;

        self.items.get(self.len).copied()
    }

    fn combine_top(&mut self, count: u8, dominant: Tri) -> Option<()> {
        let start = self.len.checked_sub(usize::from(count))?;
        let result = combine(self.items.get(start..self.len)?, dominant);

        self.len = start;
        self.push(result)
    }
}

fn leaf_result(instr: Instr, facts: &FactStore, now_ms: u64) -> Option<Tri> {
    let view = |fact: u16| facts.view(usize::from(fact), now_ms);

    match instr {
        Instr::EqNum { fact, value } => {
            let v = view(fact);

            Some(leaf(v, (v.num - value).abs() < f64::EPSILON))
        }
        Instr::EqSym { fact, value } => {
            let v = view(fact);

            Some(leaf(v, v.sym == value))
        }
        Instr::AtLeast { fact, value } => {
            let v = view(fact);

            Some(leaf(v, v.num >= value))
        }
        Instr::AtMost { fact, value } => {
            let v = view(fact);

            Some(leaf(v, v.num <= value))
        }
        _ => None,
    }
}

fn run(instr: Instr, stack: &mut Stack, facts: &FactStore, now_ms: u64) -> Option<()> {
    match instr {
        Instr::All { count } => stack.combine_top(count, Tri::False),
        Instr::Any { count } => stack.combine_top(count, Tri::True),
        Instr::Not => {
            let top = stack.pop()?;

            stack.push(top.invert())
        }
        other => stack.push(leaf_result(other, facts, now_ms)?),
    }
}

pub fn eval(code: &[Instr], facts: &FactStore, now_ms: u64) -> Tri {
    let mut stack = Stack {
        items: [Tri::Unknown; MAX_STACK],
        len: 0,
    };

    for instr in code {
        if run(*instr, &mut stack, facts, now_ms).is_none() {
            return Tri::Unknown;
        }
    }

    stack.pop().unwrap_or(Tri::Unknown)
}

pub fn well_formed(code: &[Instr]) -> bool {
    let mut depth = 0usize;

    for instr in code {
        let pops = match instr {
            Instr::All { count } | Instr::Any { count } => usize::from(*count),
            Instr::Not => 1,
            _ => 0,
        };

        let Some(left) = depth.checked_sub(pops) else {
            return false;
        };

        depth = left + 1;

        if depth > MAX_STACK {
            return false;
        }
    }

    depth == 1
}

pub fn leaf_fact(instr: &Instr) -> Option<u16> {
    match instr {
        Instr::EqNum { fact, .. }
        | Instr::EqSym { fact, .. }
        | Instr::AtLeast { fact, .. }
        | Instr::AtMost { fact, .. } => Some(*fact),
        _ => None,
    }
}

pub fn leaf_outcome(instr: &Instr, facts: &FactStore, now_ms: u64) -> Tri {
    leaf_result(*instr, facts, now_ms).unwrap_or(Tri::Unknown)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::facts::Fact;

    fn store() -> FactStore {
        let mut store = FactStore::new(&[100, 100]);

        store.write(
            0,
            Fact {
                num: 0.8,
                sym: 4,
                stamp_ms: 0,
            },
        );

        store
    }

    #[test]
    fn compares_fresh_facts() {
        let facts = store();
        let at_least = |value| [Instr::AtLeast { fact: 0, value }];

        assert_eq!(eval(&at_least(0.6), &facts, 0), Tri::True);
        assert_eq!(eval(&at_least(0.9), &facts, 0), Tri::False);
        assert_eq!(
            eval(&[Instr::EqSym { fact: 0, value: 4 }], &facts, 0),
            Tri::True
        );
        assert_eq!(
            eval(
                &[Instr::AtMost {
                    fact: 0,
                    value: 0.5
                }],
                &facts,
                0
            ),
            Tri::False
        );
    }

    #[test]
    fn a_stale_fact_is_unknown_even_when_negated() {
        let facts = store();
        let code = [
            Instr::AtLeast {
                fact: 0,
                value: 0.6,
            },
            Instr::Not,
        ];

        assert_eq!(eval(&code, &facts, 0), Tri::False);
        assert_eq!(eval(&code, &facts, 500), Tri::Unknown);
    }

    #[test]
    fn combines_with_kleene_logic() {
        let facts = store();
        let unknown = Instr::EqNum {
            fact: 1,
            value: 1.0,
        };
        let yes = Instr::AtLeast {
            fact: 0,
            value: 0.6,
        };
        let no = Instr::AtLeast {
            fact: 0,
            value: 0.9,
        };

        assert_eq!(
            eval(&[yes, unknown, Instr::Any { count: 2 }], &facts, 0),
            Tri::True
        );
        assert_eq!(
            eval(&[no, unknown, Instr::Any { count: 2 }], &facts, 0),
            Tri::Unknown
        );
        assert_eq!(
            eval(&[no, unknown, Instr::All { count: 2 }], &facts, 0),
            Tri::False
        );
        assert_eq!(
            eval(&[yes, unknown, Instr::All { count: 2 }], &facts, 0),
            Tri::Unknown
        );
    }

    #[test]
    fn refuses_programs_that_break_the_stack() {
        let leaf = Instr::EqNum {
            fact: 0,
            value: 1.0,
        };

        assert!(well_formed(&[leaf, Instr::Not]));
        assert!(!well_formed(&[Instr::Not]));
        assert!(!well_formed(&[]));
        assert!(!well_formed(&[Instr::All { count: 3 }]));
        assert!(!well_formed(&[leaf; 17]));
    }
}
