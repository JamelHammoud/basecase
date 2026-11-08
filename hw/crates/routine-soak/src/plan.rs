use serde_json::Value;

#[derive(Debug, Clone)]
pub struct Op {
    pub kind: String,
    pub node: String,
}

#[derive(Debug, Clone)]
pub struct PlanInfo {
    pub hash: String,
    pub watcher_facts: Vec<(usize, String)>,
    pub ops: Vec<Op>,
    pub skills: Vec<String>,
    pub safe_stop: u16,
    pub deadline_ms: u32,
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn list<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value.get(key).and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

pub fn read(json: &str) -> Result<PlanInfo, String> {
    let plan: Value = serde_json::from_str(json).map_err(|e| format!("The plan isn't JSON: {e}"))?;
    let watcher_facts = list(&plan, "facts")
        .iter()
        .enumerate()
        .filter(|(_, f)| text(f, "source") == "watcher")
        .map(|(i, f)| (i, text(f, "id")))
        .collect();
    let ops = list(&plan, "ops")
        .iter()
        .map(|o| Op {
            kind: text(o, "kind"),
            node: text(o, "node"),
        })
        .collect();
    let number = |key: &str| plan.get(key).and_then(Value::as_u64).unwrap_or_default();

    Ok(PlanInfo {
        hash: text(&plan, "hash"),
        watcher_facts,
        ops,
        skills: list(&plan, "skills").iter().map(|s| text(s, "id")).collect(),
        safe_stop: u16::try_from(number("safeStop")).map_err(|_| "Bad safe stop")?,
        deadline_ms: u32::try_from(number("controlDeadlineMs")).map_err(|_| "Bad control deadline")?,
    })
}
