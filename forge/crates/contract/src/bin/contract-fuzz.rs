use contract::json::Json;
use contract::{evaluate_json, Outcome};

const SIGNALS: [&str; 4] = ["a", "b", "c", "d"];
const DEFAULT_SEED: u64 = 0x5eed_c0de;
const DEFAULT_COUNT: usize = 300;

struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    fn below(&mut self, limit: u64) -> u64 {
        self.next() % limit
    }

    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn between(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.unit()
    }

    fn signal(&mut self) -> Json {
        Json::Str(String::from(SIGNALS[self.below(4) as usize]))
    }
}

fn one(key: &str, value: Json) -> Json {
    Json::Obj(vec![(String::from(key), value)])
}

fn fields(items: Vec<(&str, Json)>) -> Json {
    Json::Obj(
        items
            .into_iter()
            .map(|(key, value)| (String::from(key), value))
            .collect(),
    )
}

fn point(random: &mut Random) -> Json {
    Json::Arr(vec![random.signal(), random.signal(), random.signal()])
}

fn pair(random: &mut Random) -> Json {
    Json::Arr(vec![point(random), point(random)])
}

fn expr(random: &mut Random, depth: u32) -> Json {
    let choice = if depth == 0 { 0 } else { random.below(6) };

    match choice {
        1 => one("abs", expr(random, depth - 1)),
        2 => one("delta", expr(random, depth - 1)),
        3 => one("dist", pair(random)),
        4 => one("angle", pair(random)),
        _ => one("signal", random.signal()),
    }
}

fn atom(random: &mut Random) -> Json {
    let cmp = ["<", "<=", ">", ">="][random.below(4) as usize];
    let expression = expr(random, 2);
    let value = random.between(-1.5, 1.5);
    let scale = random.between(0.05, 3.0);

    one(
        "atom",
        fields(vec![
            ("expr", expression),
            ("cmp", Json::Str(String::from(cmp))),
            ("value", Json::Num(value)),
            ("scale", Json::Num(scale)),
        ]),
    )
}

fn state(random: &mut Random, depth: u32) -> Json {
    let choice = if depth == 0 { 3 } else { random.below(6) };

    match choice {
        0 => one("all", states(random, depth - 1)),
        1 => one("any", states(random, depth - 1)),
        2 => one("not", state(random, depth - 1)),
        _ => atom(random),
    }
}

fn states(random: &mut Random, depth: u32) -> Json {
    let count = 1 + random.below(3);

    Json::Arr((0..count).map(|_| state(random, depth)).collect())
}

fn window(random: &mut Random) -> Json {
    match random.below(5) {
        0 => {
            let from = random.between(0.0, 2.0);
            let length = random.between(0.1, 4.0);

            fields(vec![
                ("from", Json::Num(from)),
                ("to", Json::Num(from + length)),
            ])
        }
        1 => one("last", Json::Num(random.between(0.1, 3.0))),
        _ => Json::Str(String::from("whole")),
    }
}

fn timed(random: &mut Random, depth: u32) -> Json {
    let window = window(random);
    let state = state(random, depth);

    fields(vec![("window", window), ("state", state)])
}

fn hold_for(random: &mut Random, depth: u32) -> Json {
    let seconds = random.between(0.02, 0.6);
    let state = state(random, depth);
    let within = window(random);

    fields(vec![
        ("seconds", Json::Num(seconds)),
        ("state", state),
        ("within", within),
    ])
}

fn formula(random: &mut Random, depth: u32) -> Json {
    let choice = if depth == 0 {
        random.below(3) + 3
    } else {
        random.below(6)
    };

    match choice {
        0 => one("all", formulas(random, depth - 1)),
        1 => one("any", formulas(random, depth - 1)),
        2 => one("sequence", formulas(random, depth - 1)),
        3 => one("always", timed(random, 2)),
        4 => one("eventually", timed(random, 2)),
        _ => one("hold_for", hold_for(random, 2)),
    }
}

fn formulas(random: &mut Random, depth: u32) -> Json {
    let count = 1 + random.below(3);

    Json::Arr((0..count).map(|_| formula(random, depth)).collect())
}

fn failure(random: &mut Random, index: u64) -> Json {
    let label = Json::Str(format!("failure \"{index}\""));
    let formula = formula(random, 1);

    fields(vec![("label", label), ("formula", formula)])
}

fn contract_json(random: &mut Random) -> Json {
    let success = formula(random, 3);
    let count = random.below(3);
    let failures = Json::Arr((0..count).map(|index| failure(random, index)).collect());

    fields(vec![
        ("version", Json::Num(1.0)),
        ("success", success),
        ("failures", failures),
    ])
}

fn walk(random: &mut Random, ticks: usize) -> Json {
    let mut value = random.between(-1.5, 1.5);
    let flaky = random.below(12) == 0;
    let mut samples = Vec::with_capacity(ticks);

    for _ in 0..ticks {
        value += random.between(-0.3, 0.3);
        samples.push(if flaky && random.below(9) == 0 {
            Json::Null
        } else {
            Json::Num(value)
        });
    }

    Json::Arr(samples)
}

fn trace_json(random: &mut Random) -> Json {
    let ticks = 2 + random.below(120) as usize;
    let dt = [0.002, 0.01, 0.02, 0.05, 0.1][random.below(5) as usize];
    let signals = SIGNALS
        .iter()
        .map(|name| (String::from(*name), walk(random, ticks)))
        .collect();

    fields(vec![("dt", Json::Num(dt)), ("signals", Json::Obj(signals))])
}

fn accepted_case(random: &mut Random) -> (Json, Json, Outcome) {
    loop {
        let contract = contract_json(random);
        let trace = trace_json(random);

        if let Ok(outcome) = evaluate_json(&contract.text(), &trace.text()) {
            return (contract, trace, outcome);
        }
    }
}

fn labels(failed: &[String]) -> Json {
    Json::Arr(
        failed
            .iter()
            .map(|label| Json::Str(label.clone()))
            .collect(),
    )
}

fn case_json(random: &mut Random) -> Json {
    let (contract, trace, outcome) = accepted_case(random);

    fields(vec![
        ("contract", contract),
        ("trace", trace),
        ("passed", Json::Bool(outcome.passed)),
        ("margin", Json::Num(outcome.margin)),
        ("worstAt", Json::Num(outcome.worst_at)),
        ("failed", labels(&outcome.failed)),
    ])
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let count = args
        .get(1)
        .and_then(|text| text.parse().ok())
        .unwrap_or(DEFAULT_COUNT);
    let seed: u64 = args
        .get(2)
        .and_then(|text| text.parse().ok())
        .unwrap_or(DEFAULT_SEED);
    let mut random = Random(seed | 1);
    let cases = Json::Arr((0..count).map(|_| case_json(&mut random)).collect());

    println!("{}", cases.text());
}
