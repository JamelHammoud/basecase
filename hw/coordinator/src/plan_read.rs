use crate::cond::{well_formed, Instr, MAX_STACK};
use crate::json::{self, Value};
use crate::plan::{
    Base, Interrupt, LoadError, Op, OpKind, Plan, Reaction, Retrigger, Skill, Span, ABANDON, END,
    MAX_FACTS, MAX_OPS, MAX_REACTIONS, MAX_SKILLS, MAX_WATCHERS,
};
use crate::slots::{BODY, HEAD, VOICE};

const PLAN_SCHEMA: i32 = 1;
const ALL_RESOURCES: i32 = (BODY | HEAD | VOICE) as i32;

fn bad(code: &'static str) -> LoadError {
    LoadError(code)
}

fn field<'a>(v: &'a Value, key: &str) -> Result<&'a Value, LoadError> {
    v.get(key).ok_or(bad("missing-field"))
}

fn int(v: &Value) -> Result<i32, LoadError> {
    let n = v.as_f64().ok_or(bad("not-a-number"))?;

    if n.fract() != 0.0 || n < f64::from(i32::MIN) || n > f64::from(i32::MAX) {
        return Err(bad("not-an-integer"));
    }

    Ok(n as i32)
}

fn int_field(v: &Value, key: &str) -> Result<i32, LoadError> {
    int(field(v, key)?)
}

fn index_field(v: &Value, key: &str, limit: usize) -> Result<u16, LoadError> {
    let n = int_field(v, key)?;

    usize::try_from(n)
        .ok()
        .filter(|i| *i < limit && *i < usize::from(u16::MAX))
        .map(|i| i as u16)
        .ok_or(bad("index-out-of-range"))
}

fn ms_field(v: &Value, key: &str) -> Result<u32, LoadError> {
    u32::try_from(int_field(v, key)?).map_err(|_| bad("negative-time"))
}

fn list<'a>(v: &'a Value, key: &str, limit: usize) -> Result<&'a [Value], LoadError> {
    let items = field(v, key)?.as_arr().ok_or(bad("not-a-list"))?;

    if items.len() > limit {
        return Err(bad("too-large"));
    }

    Ok(items)
}

fn read_instr(v: &Value, facts: usize) -> Result<Instr, LoadError> {
    let parts = v.as_arr().ok_or(bad("bad-condition"))?;
    let [code, a, b] = parts else {
        return Err(bad("bad-condition"));
    };
    let fact = || -> Result<u16, LoadError> {
        usize::try_from(int(a)?)
            .ok()
            .filter(|i| *i < facts)
            .map(|i| i as u16)
            .ok_or(bad("index-out-of-range"))
    };
    let number = b.as_f64().ok_or(bad("bad-condition"))?;
    let count = || -> Result<u8, LoadError> {
        u8::try_from(int(a)?)
            .ok()
            .filter(|c| *c > 0 && usize::from(*c) <= MAX_STACK)
            .ok_or(bad("bad-condition"))
    };

    Ok(match int(code)? {
        0 => Instr::EqNum {
            fact: fact()?,
            value: number,
        },
        1 => Instr::EqSym {
            fact: fact()?,
            value: int(b)?,
        },
        2 => Instr::AtLeast {
            fact: fact()?,
            value: number,
        },
        3 => Instr::AtMost {
            fact: fact()?,
            value: number,
        },
        4 => Instr::All { count: count()? },
        5 => Instr::Any { count: count()? },
        6 => Instr::Not,
        _ => return Err(bad("bad-condition")),
    })
}

fn read_conds(root: &Value, facts: usize) -> Result<(Vec<Span>, Vec<Instr>), LoadError> {
    let mut spans = Vec::new();
    let mut instrs = Vec::new();

    for cond in list(root, "conds", MAX_OPS)? {
        let code = cond.as_arr().ok_or(bad("bad-condition"))?;
        let start = instrs.len();

        for item in code {
            instrs.push(read_instr(item, facts)?);
        }

        let body = instrs.get(start..).unwrap_or(&[]);

        if !well_formed(body) || instrs.len() > usize::from(u16::MAX) {
            return Err(bad("bad-condition"));
        }

        spans.push(Span {
            start: start as u16,
            len: code.len() as u16,
        });
    }

    Ok((spans, instrs))
}

fn read_skill(v: &Value, count: usize) -> Result<Skill, LoadError> {
    let holds = int_field(v, "holds")?;

    if !(0..=ALL_RESOURCES).contains(&holds) {
        return Err(bad("bad-resources"));
    }

    let interrupt = match int_field(v, "interrupt")? {
        0 => Interrupt::Any,
        1 => Interrupt::AtPhase,
        2 => Interrupt::Never,
        _ => return Err(bad("bad-interrupt")),
    };

    Ok(Skill {
        holds: holds as u8,
        interrupt,
        stop_via: index_field(v, "stopVia", count)?,
    })
}

fn checked_target(pc: usize, target: i32, ops: usize) -> Result<i32, LoadError> {
    if target == END || target == ABANDON {
        return Ok(target);
    }

    let forward = usize::try_from(target).is_ok_and(|t| t > pc && t < ops);

    if forward {
        Ok(target)
    } else {
        Err(bad("bad-jump"))
    }
}

struct OpContext<'a> {
    pc: usize,
    ops: usize,
    facts: usize,
    skills: usize,
    conds: usize,
    flat: &'a mut Vec<i32>,
}

impl OpContext<'_> {
    fn target(&self, v: &Value, key: &str) -> Result<i32, LoadError> {
        checked_target(self.pc, int_field(v, key)?, self.ops)
    }

    fn push_flat(&mut self, v: &Value, key: &str) -> Result<Span, LoadError> {
        let items = list(v, key, MAX_OPS)?;
        let start = self.flat.len();

        for item in items {
            self.flat.push(int(item)?);
        }

        if self.flat.len() > usize::from(u16::MAX) {
            return Err(bad("too-large"));
        }

        Ok(Span {
            start: start as u16,
            len: items.len() as u16,
        })
    }

    fn checked_facts(&self, span: Span) -> Result<Span, LoadError> {
        let start = usize::from(span.start);
        let items = self
            .flat
            .get(start..start + usize::from(span.len))
            .unwrap_or(&[]);
        let valid = items
            .iter()
            .all(|f| usize::try_from(*f).is_ok_and(|i| i < self.facts));

        if valid {
            Ok(span)
        } else {
            Err(bad("index-out-of-range"))
        }
    }

    fn checked_branches(&self, span: Span) -> Result<Span, LoadError> {
        let start = usize::from(span.start);
        let items = self
            .flat
            .get(start..start + usize::from(span.len))
            .unwrap_or(&[]);

        for branch in items {
            checked_target(self.pc, *branch, self.ops)?;
        }

        Ok(span)
    }

    fn kind(&mut self, v: &Value) -> Result<OpKind, LoadError> {
        let kind = field(v, "kind")?.as_str().ok_or(bad("bad-op"))?;

        match kind {
            "do" => Ok(OpKind::Do {
                skill: index_field(v, "skill", self.skills)?,
                holds: read_mask(v)?,
            }),
            "say" => {
                let needs = self.push_flat(v, "needs")?;

                Ok(OpKind::Say {
                    text: int_field(v, "text")?,
                    needs: self.checked_facts(needs)?,
                })
            }
            "infer" => Ok(OpKind::Infer {
                fact: index_field(v, "fact", self.facts)?,
            }),
            "ask" => Ok(OpKind::Ask {
                fact: index_field(v, "fact", self.facts)?,
                answers: self.push_flat(v, "answers")?,
            }),
            "if" => Ok(OpKind::If {
                test: index_field(v, "test", self.conds)?,
                then: self.target(v, "then")?,
                otherwise: self.target(v, "else")?,
            }),
            "wait" => Ok(OpKind::Wait {
                until: read_until(v, self.conds)?,
                ms: ms_field(v, "ms")?,
            }),
            "together" => {
                let branches = self.push_flat(v, "branches")?;

                Ok(OpKind::Together {
                    branches: self.checked_branches(branches)?,
                    any: field(v, "joinAny")?.as_bool().ok_or(bad("bad-op"))?,
                })
            }
            _ => Err(bad("bad-op")),
        }
    }

    fn op(&mut self, v: &Value) -> Result<Op, LoadError> {
        let kind = self.kind(v)?;
        let guarded = !matches!(kind, OpKind::If { .. } | OpKind::Together { .. });

        Ok(Op {
            kind,
            next: if matches!(kind, OpKind::If { .. }) {
                END
            } else {
                self.target(v, "next")?
            },
            on_timeout: if guarded {
                self.target(v, "onTimeout")?
            } else {
                ABANDON
            },
            on_fail: if guarded {
                self.target(v, "onFail")?
            } else {
                ABANDON
            },
            timeout_ms: if guarded {
                ms_field(v, "timeoutMs")?
            } else {
                0
            },
        })
    }
}

fn read_mask(v: &Value) -> Result<u8, LoadError> {
    let holds = int_field(v, "holds")?;

    if (0..=ALL_RESOURCES).contains(&holds) {
        Ok(holds as u8)
    } else {
        Err(bad("bad-resources"))
    }
}

fn read_until(v: &Value, conds: usize) -> Result<i32, LoadError> {
    let until = int_field(v, "until")?;

    if until == -1 || usize::try_from(until).is_ok_and(|u| u < conds) {
        Ok(until)
    } else {
        Err(bad("index-out-of-range"))
    }
}

fn read_reaction(v: &Value, conds: usize, ops: usize) -> Result<Reaction, LoadError> {
    let entry = int_field(v, "entry")?;

    if entry != END && usize::try_from(entry).map_or(true, |e| e >= ops) {
        return Err(bad("bad-jump"));
    }

    Ok(Reaction {
        when: index_field(v, "when", conds)?,
        cooldown_ms: ms_field(v, "cooldownMs")?,
        retrigger: match int_field(v, "retrigger")? {
            0 => Retrigger::Ignore,
            1 => Retrigger::Restart,
            2 => Retrigger::Queue,
            _ => return Err(bad("bad-retrigger")),
        },
        stop_first: field(v, "stopFirst")?
            .as_bool()
            .ok_or(bad("bad-reaction"))?,
        entry,
    })
}

fn read_path_entry(v: &Value, key: &str, ops: usize) -> Result<i32, LoadError> {
    let entry = int_field(v, key)?;

    if entry == ABANDON || usize::try_from(entry).is_ok_and(|e| e < ops) {
        Ok(entry)
    } else {
        Err(bad("bad-jump"))
    }
}

fn read_base(v: &Value, skills: usize, ops: usize) -> Result<Base, LoadError> {
    Ok(Base {
        skill: index_field(v, "skill", skills)?,
        timeout_ms: ms_field(v, "timeoutMs")?,
        on_timeout: read_path_entry(v, "onTimeout", ops)?,
        on_fail: read_path_entry(v, "onFail", ops)?,
    })
}

fn read_ages(root: &Value) -> Result<Vec<u32>, LoadError> {
    list(root, "facts", MAX_FACTS)?
        .iter()
        .map(|fact| ms_field(fact, "maxAgeMs"))
        .collect()
}

fn read_skills(root: &Value) -> Result<Vec<Skill>, LoadError> {
    let items = list(root, "skills", MAX_SKILLS)?;

    items
        .iter()
        .map(|skill| read_skill(skill, items.len()))
        .collect()
}

fn read_ops(
    root: &Value,
    facts: usize,
    skills: usize,
    conds: usize,
) -> Result<(Vec<Op>, Vec<i32>), LoadError> {
    let items = list(root, "ops", MAX_OPS)?;
    let mut flat = Vec::new();
    let mut ops = Vec::with_capacity(items.len());

    for (pc, item) in items.iter().enumerate() {
        let mut context = OpContext {
            pc,
            ops: items.len(),
            facts,
            skills,
            conds,
            flat: &mut flat,
        };

        ops.push(context.op(item)?);
    }

    Ok((ops, flat))
}

fn read_watchers(root: &Value, conds: usize) -> Result<Vec<i32>, LoadError> {
    list(root, "watchers", MAX_WATCHERS)?
        .iter()
        .map(|watcher| read_until_when(watcher, conds))
        .collect()
}

fn read_until_when(v: &Value, conds: usize) -> Result<i32, LoadError> {
    let when = int_field(v, "when")?;

    if when == -1 || usize::try_from(when).is_ok_and(|w| w < conds) {
        Ok(when)
    } else {
        Err(bad("index-out-of-range"))
    }
}

pub fn read_plan(text: &str) -> Result<Plan, LoadError> {
    let root = json::parse(text).ok_or(bad("not-json"))?;

    if int_field(&root, "schema")? != PLAN_SCHEMA {
        return Err(bad("wrong-schema"));
    }

    let fact_ages = read_ages(&root)?;
    let (conds, instrs) = read_conds(&root, fact_ages.len())?;
    let skills = read_skills(&root)?;
    let (ops, flat) = read_ops(&root, fact_ages.len(), skills.len(), conds.len())?;
    let reactions = list(&root, "reactions", MAX_REACTIONS)?
        .iter()
        .map(|reaction| read_reaction(reaction, conds.len(), ops.len()))
        .collect::<Result<Vec<_>, _>>()?;
    let watcher_whens = read_watchers(&root, conds.len())?;
    let base = read_base(field(&root, "base")?, skills.len(), ops.len())?;

    Ok(Plan {
        safe_stop: index_field(&root, "safeStop", skills.len())?,
        stop_timeout_ms: ms_field(&root, "stopTimeoutMs")?,
        control_deadline_ms: ms_field(&root, "controlDeadlineMs")?,
        fact_ages,
        conds,
        instrs,
        skills,
        ops,
        reactions,
        watcher_whens,
        flat,
        base,
    })
}
