use crate::json::Json;

pub const MAX_DEPTH: usize = 64;
pub const MAX_NODES: usize = 4096;
pub const FINAL_ONLY: &str = "A success that only looks at the final state can pass by luck";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Cmp {
    Lt,
    Le,
    Gt,
    Ge,
}

impl Cmp {
    pub fn wants_above(self) -> bool {
        matches!(self, Cmp::Gt | Cmp::Ge)
    }
}

pub type Point = [String; 3];

#[derive(Debug, Clone)]
pub enum Expr {
    Signal(String),
    Abs(Box<Expr>),
    Delta(Box<Expr>),
    Dist(Box<[Point; 2]>),
    Angle(Box<[Point; 2]>),
}

#[derive(Debug, Clone)]
pub struct Atom {
    pub expr: Expr,
    pub cmp: Cmp,
    pub value: f64,
    pub scale: f64,
}

#[derive(Debug, Clone)]
pub enum State {
    All(Vec<State>),
    Any(Vec<State>),
    Not(Box<State>),
    Atom(Atom),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Window {
    Whole,
    Between(f64, f64),
    Last(f64),
}

#[derive(Debug, Clone)]
pub enum Formula {
    All(Vec<Formula>),
    Any(Vec<Formula>),
    Always(Window, State),
    Eventually(Window, State),
    HoldFor {
        seconds: f64,
        state: State,
        within: Window,
    },
    Sequence(Vec<Formula>),
}

#[derive(Debug, Clone)]
pub struct Failure {
    pub label: String,
    pub formula: Formula,
}

#[derive(Debug, Clone)]
pub struct Contract {
    pub success: Formula,
    pub failures: Vec<Failure>,
}

struct Reader {
    nodes: usize,
}

type Fields = Vec<(String, Json)>;

fn only_key(json: &Json, what: &str) -> Result<(String, Json), String> {
    match json {
        Json::Obj(fields) if fields.len() == 1 => Ok(fields[0].clone()),
        _ => Err(format!("{what} must be an object with one key")),
    }
}

fn exact_fields(json: &Json, names: &[&str], what: &str) -> Result<Fields, String> {
    let Json::Obj(fields) = json else {
        return Err(format!("{what} must be an object"));
    };

    if fields.len() != names.len()
        || !names
            .iter()
            .all(|name| fields.iter().any(|(key, _)| key == name))
    {
        return Err(format!(
            "{what} must have exactly the fields {}",
            names.join(", ")
        ));
    }

    Ok(fields.clone())
}

fn field<'a>(fields: &'a Fields, name: &str) -> &'a Json {
    fields
        .iter()
        .find(|(key, _)| key == name)
        .map_or(&Json::Null, |(_, value)| value)
}

fn finite(json: &Json, what: &str) -> Result<f64, String> {
    match json {
        Json::Num(value) if value.is_finite() => Ok(*value),
        _ => Err(format!("{what} must be a finite number")),
    }
}

fn list<'a>(json: &'a Json, what: &str) -> Result<&'a [Json], String> {
    match json {
        Json::Arr(items) if !items.is_empty() => Ok(items),
        _ => Err(format!("{what} must be a list with at least one item")),
    }
}

fn name(json: &Json, what: &str) -> Result<String, String> {
    match json {
        Json::Str(text) if !text.is_empty() => Ok(text.clone()),
        _ => Err(format!("{what} must be a non-empty string")),
    }
}

fn parse_cmp(json: &Json) -> Result<Cmp, String> {
    let Json::Str(text) = json else {
        return Err(String::from("A comparison must be a string"));
    };

    match text.as_str() {
        "<" => Ok(Cmp::Lt),
        "<=" => Ok(Cmp::Le),
        ">" => Ok(Cmp::Gt),
        ">=" => Ok(Cmp::Ge),
        other => Err(format!("Unknown comparison {other}")),
    }
}

fn parse_point(json: &Json) -> Result<Point, String> {
    match json {
        Json::Arr(items) if items.len() == 3 => Ok([
            name(&items[0], "A point axis")?,
            name(&items[1], "A point axis")?,
            name(&items[2], "A point axis")?,
        ]),
        _ => Err(String::from("A point must list three signals")),
    }
}

fn parse_points(json: &Json) -> Result<Box<[Point; 2]>, String> {
    match json {
        Json::Arr(items) if items.len() == 2 => {
            Ok(Box::new([parse_point(&items[0])?, parse_point(&items[1])?]))
        }
        _ => Err(String::from("dist and angle need two points")),
    }
}

fn parse_window(json: &Json) -> Result<Window, String> {
    match json {
        Json::Str(text) if text == "whole" => Ok(Window::Whole),
        Json::Obj(fields) if fields.len() == 1 && fields[0].0 == "last" => parse_last(&fields[0].1),
        Json::Obj(_) => parse_between(json),
        _ => Err(String::from(
            "A window must be whole, a from and to, or a last",
        )),
    }
}

fn parse_last(json: &Json) -> Result<Window, String> {
    let seconds = finite(json, "A last window")?;

    if seconds < 0.0 {
        return Err(String::from("A last window cannot be negative"));
    }

    Ok(Window::Last(seconds))
}

fn parse_between(json: &Json) -> Result<Window, String> {
    let fields = exact_fields(json, &["from", "to"], "A window")?;
    let from = finite(field(&fields, "from"), "A window start")?;
    let to = finite(field(&fields, "to"), "A window end")?;

    if from < 0.0 || to <= from {
        return Err(String::from(
            "A window must start at or after 0 and end after it starts",
        ));
    }

    Ok(Window::Between(from, to))
}

impl Reader {
    fn enter(&mut self, depth: usize) -> Result<(), String> {
        if depth > MAX_DEPTH {
            return Err(format!("A contract can nest at most {MAX_DEPTH} levels"));
        }

        self.nodes += 1;

        if self.nodes > MAX_NODES {
            return Err(format!("A contract can have at most {MAX_NODES} nodes"));
        }

        Ok(())
    }

    fn expr(&mut self, json: &Json, depth: usize) -> Result<Expr, String> {
        self.enter(depth)?;

        let (key, inner) = only_key(json, "An expression")?;

        match key.as_str() {
            "signal" => Ok(Expr::Signal(name(&inner, "A signal")?)),
            "abs" => Ok(Expr::Abs(Box::new(self.expr(&inner, depth + 1)?))),
            "delta" => Ok(Expr::Delta(Box::new(self.expr(&inner, depth + 1)?))),
            "dist" => Ok(Expr::Dist(parse_points(&inner)?)),
            "angle" => Ok(Expr::Angle(parse_points(&inner)?)),
            other => Err(format!("Unknown expression {other}")),
        }
    }

    fn atom(&mut self, json: &Json, depth: usize) -> Result<Atom, String> {
        let fields = exact_fields(json, &["expr", "cmp", "value", "scale"], "An atom")?;
        let scale = finite(field(&fields, "scale"), "An atom scale")?;

        if scale <= 0.0 {
            return Err(String::from("An atom scale must be above 0"));
        }

        Ok(Atom {
            expr: self.expr(field(&fields, "expr"), depth + 1)?,
            cmp: parse_cmp(field(&fields, "cmp"))?,
            value: finite(field(&fields, "value"), "An atom value")?,
            scale,
        })
    }

    fn states(&mut self, json: &Json, depth: usize) -> Result<Vec<State>, String> {
        list(json, "all and any")?
            .iter()
            .map(|item| self.state(item, depth + 1))
            .collect()
    }

    fn state(&mut self, json: &Json, depth: usize) -> Result<State, String> {
        self.enter(depth)?;

        let (key, inner) = only_key(json, "A state")?;

        match key.as_str() {
            "all" => Ok(State::All(self.states(&inner, depth)?)),
            "any" => Ok(State::Any(self.states(&inner, depth)?)),
            "not" => Ok(State::Not(Box::new(self.state(&inner, depth + 1)?))),
            "atom" => Ok(State::Atom(self.atom(&inner, depth)?)),
            other => Err(format!("Unknown state {other}")),
        }
    }

    fn formulas(&mut self, json: &Json, depth: usize) -> Result<Vec<Formula>, String> {
        list(json, "all, any and sequence")?
            .iter()
            .map(|item| self.formula(item, depth + 1))
            .collect()
    }

    fn timed(&mut self, json: &Json, depth: usize) -> Result<(Window, State), String> {
        let fields = exact_fields(json, &["window", "state"], "always and eventually")?;

        Ok((
            parse_window(field(&fields, "window"))?,
            self.state(field(&fields, "state"), depth + 1)?,
        ))
    }

    fn hold_for(&mut self, json: &Json, depth: usize) -> Result<Formula, String> {
        let fields = exact_fields(json, &["seconds", "state", "within"], "hold_for")?;
        let seconds = finite(field(&fields, "seconds"), "hold_for seconds")?;

        if seconds <= 0.0 {
            return Err(String::from("hold_for seconds must be above 0"));
        }

        Ok(Formula::HoldFor {
            seconds,
            state: self.state(field(&fields, "state"), depth + 1)?,
            within: parse_window(field(&fields, "within"))?,
        })
    }

    fn formula(&mut self, json: &Json, depth: usize) -> Result<Formula, String> {
        self.enter(depth)?;

        let (key, inner) = only_key(json, "A formula")?;

        match key.as_str() {
            "all" => Ok(Formula::All(self.formulas(&inner, depth)?)),
            "any" => Ok(Formula::Any(self.formulas(&inner, depth)?)),
            "sequence" => Ok(Formula::Sequence(self.formulas(&inner, depth)?)),
            "hold_for" => self.hold_for(&inner, depth),
            "always" => self
                .timed(&inner, depth)
                .map(|(window, state)| Formula::Always(window, state)),
            "eventually" => self
                .timed(&inner, depth)
                .map(|(window, state)| Formula::Eventually(window, state)),
            other => Err(format!("Unknown formula {other}")),
        }
    }

    fn failure(&mut self, json: &Json) -> Result<Failure, String> {
        let fields = exact_fields(json, &["label", "formula"], "A failure")?;

        Ok(Failure {
            label: name(field(&fields, "label"), "A failure label")?,
            formula: self.formula(field(&fields, "formula"), 1)?,
        })
    }

    fn failures(&mut self, json: &Json) -> Result<Vec<Failure>, String> {
        let Json::Arr(items) = json else {
            return Err(String::from("failures must be a list"));
        };

        items.iter().map(|item| self.failure(item)).collect()
    }
}

fn collect_expr(expr: &Expr, out: &mut Vec<String>) {
    match expr {
        Expr::Signal(name) => out.push(name.clone()),
        Expr::Abs(inner) | Expr::Delta(inner) => collect_expr(inner, out),
        Expr::Dist(points) | Expr::Angle(points) => out.extend(points.iter().flatten().cloned()),
    }
}

fn collect_state(state: &State, out: &mut Vec<String>) {
    match state {
        State::All(items) | State::Any(items) => {
            items.iter().for_each(|item| collect_state(item, out))
        }
        State::Not(inner) => collect_state(inner, out),
        State::Atom(atom) => collect_expr(&atom.expr, out),
    }
}

fn collect_formula(formula: &Formula, out: &mut Vec<String>) {
    match formula {
        Formula::All(items) | Formula::Any(items) | Formula::Sequence(items) => {
            items.iter().for_each(|item| collect_formula(item, out))
        }
        Formula::Always(_, state)
        | Formula::Eventually(_, state)
        | Formula::HoldFor { state, .. } => collect_state(state, out),
    }
}

pub fn final_only(formula: &Formula, is_final: &impl Fn(&Window) -> bool) -> bool {
    match formula {
        Formula::All(items) | Formula::Sequence(items) => {
            items.iter().all(|item| final_only(item, is_final))
        }
        Formula::Any(items) => items.iter().any(|item| final_only(item, is_final)),
        Formula::Always(window, _) | Formula::Eventually(window, _) => is_final(window),
        Formula::HoldFor { within, .. } => is_final(within),
    }
}

impl Contract {
    pub fn from_json(text: &str) -> Result<Contract, String> {
        let root = Json::parse(text)?;
        let fields = exact_fields(&root, &["version", "success", "failures"], "A contract")?;

        if *field(&fields, "version") != Json::Num(1.0) {
            return Err(String::from("This contract version is not supported"));
        }

        let mut reader = Reader { nodes: 0 };
        let success = reader.formula(field(&fields, "success"), 1)?;
        let failures = reader.failures(field(&fields, "failures"))?;

        if final_only(&success, &|window| *window == Window::Last(0.0)) {
            return Err(String::from(FINAL_ONLY));
        }

        Ok(Contract { success, failures })
    }

    pub fn signals(&self) -> Vec<String> {
        let mut out = Vec::new();

        collect_formula(&self.success, &mut out);
        self.failures
            .iter()
            .for_each(|failure| collect_formula(&failure.formula, &mut out));
        out.sort();
        out.dedup();
        out
    }
}
