use crate::json::Json;
use std::collections::HashMap;

const NOT_NUMBERS: &str = "A signal must be a list of numbers";
const BAD_DT: &str = "A trace needs a finite dt above 0";

#[derive(Debug, Clone)]
pub struct Trace {
    pub dt: f64,
    pub ticks: usize,
    pub signals: HashMap<String, Vec<f64>>,
}

fn samples(json: &Json) -> Result<Vec<f64>, String> {
    let Json::Arr(items) = json else {
        return Err(String::from(NOT_NUMBERS));
    };

    items
        .iter()
        .map(|item| match item {
            Json::Num(value) => Ok(*value),
            Json::Null => Ok(f64::NAN),
            _ => Err(String::from(NOT_NUMBERS)),
        })
        .collect()
}

fn read_dt(fields: &[(String, Json)]) -> Result<f64, String> {
    match fields.iter().find(|(key, _)| key == "dt") {
        Some((_, Json::Num(dt))) => Ok(*dt),
        _ => Err(String::from(BAD_DT)),
    }
}

impl Trace {
    pub fn new(dt: f64, signals: HashMap<String, Vec<f64>>) -> Result<Trace, String> {
        if !dt.is_finite() || dt <= 0.0 {
            return Err(String::from(BAD_DT));
        }

        let ticks = signals.values().next().map_or(0, Vec::len);

        if signals.values().any(|values| values.len() != ticks) {
            return Err(String::from("Every signal in a trace must have the same length"));
        }

        if ticks < 2 {
            return Err(String::from("A trace needs at least two samples"));
        }

        Ok(Trace { dt, ticks, signals })
    }

    pub fn from_json(text: &str) -> Result<Trace, String> {
        let Json::Obj(fields) = Json::parse(text)? else {
            return Err(String::from("A trace must be an object"));
        };
        let Some((_, Json::Obj(signals))) = fields.iter().find(|(key, _)| key == "signals") else {
            return Err(String::from("A trace needs signals"));
        };
        let mut table = HashMap::with_capacity(signals.len());

        for (name, values) in signals {
            table.insert(name.clone(), samples(values)?);
        }

        Trace::new(read_dt(&fields)?, table)
    }

    pub fn time(&self, tick: usize) -> f64 {
        tick as f64 * self.dt
    }
}
