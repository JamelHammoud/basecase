use serde_json::Value;
use std::fs;
use std::path::Path;

pub const MAX_EPISODES: usize = 1000;
pub const MAX_ROWS: usize = 200_000;
const MIN_EPISODES: usize = 2;
const HOLD_OUT_EVERY: usize = 5;
const FIXED_OBS: usize = 12;

pub fn obs_width(nact: usize) -> usize {
    FIXED_OBS + 3 * nact
}

pub fn joint_state_columns(nact: usize) -> std::ops::Range<usize> {
    FIXED_OBS..FIXED_OBS + 2 * nact
}

pub fn last_action_columns(nact: usize) -> std::ops::Range<usize> {
    FIXED_OBS + 2 * nact..FIXED_OBS + 3 * nact
}

#[derive(Clone, Debug, Default)]
pub struct Rows {
    pub obs: Vec<f32>,
    pub actions: Vec<f32>,
    pub count: usize,
}

#[derive(Clone, Debug)]
pub struct Demos {
    pub nobs: usize,
    pub nact: usize,
    pub episodes: usize,
    pub train: Rows,
    pub held: Rows,
}

impl Demos {
    pub fn rows(&self) -> usize {
        self.train.count + self.held.count
    }
}

pub fn held_out(index: usize, episodes: usize) -> bool {
    if episodes < HOLD_OUT_EVERY {
        return index + 1 == episodes;
    }

    index % HOLD_OUT_EVERY == HOLD_OUT_EVERY - 1
}

fn finite(value: &Value) -> Option<f32> {
    value.as_f64().map(|v| v as f32).filter(|v| v.is_finite())
}

struct Place<'a> {
    episode: usize,
    key: &'a str,
    width: usize,
}

fn table(episode: &Value, place: &Place, out: &mut Vec<f32>) -> Result<usize, String> {
    let Place {
        episode: index,
        key,
        width,
    } = *place;
    let rows = episode
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("demos.json episode {} has no {key} list", index + 1))?;

    for (r, row) in rows.iter().enumerate() {
        let numbers = row
            .as_array()
            .ok_or_else(|| format!("demos.json episode {}, {key} row {} isn't a list", index + 1, r + 1))?;

        if numbers.len() != width {
            return Err(format!(
                "demos.json episode {}, {key} row {} has {} numbers, not {width}",
                index + 1,
                r + 1,
                numbers.len()
            ));
        }

        for value in numbers {
            let number = finite(value).ok_or_else(|| {
                format!(
                    "demos.json episode {}, {key} row {} holds a non-finite number",
                    index + 1,
                    r + 1
                )
            })?;

            out.push(number);
        }
    }

    Ok(rows.len())
}

fn episode(value: &Value, index: usize, demos: &mut Demos) -> Result<(), String> {
    let target = if held_out(index, demos.episodes) {
        &mut demos.held
    } else {
        &mut demos.train
    };
    let obs_rows = table(
        value,
        &Place {
            episode: index,
            key: "obs",
            width: demos.nobs,
        },
        &mut target.obs,
    )?;
    let action_rows = table(
        value,
        &Place {
            episode: index,
            key: "actions",
            width: demos.nact,
        },
        &mut target.actions,
    )?;

    if obs_rows != action_rows {
        return Err(format!(
            "demos.json episode {} has {obs_rows} observations and {action_rows} actions",
            index + 1
        ));
    }

    if obs_rows == 0 {
        return Err(format!("demos.json episode {} has no rows", index + 1));
    }

    target.count += obs_rows;

    Ok(())
}

fn episode_list(root: &Value) -> Result<&Vec<Value>, String> {
    let list = root
        .get("episodes")
        .and_then(Value::as_array)
        .ok_or("demos.json has no episodes list")?;

    if list.len() < MIN_EPISODES {
        return Err(format!(
            "demos.json needs at least {MIN_EPISODES} episodes, not {}",
            list.len()
        ));
    }

    if list.len() > MAX_EPISODES {
        return Err(format!(
            "demos.json holds {} episodes, more than {MAX_EPISODES}",
            list.len()
        ));
    }

    Ok(list)
}

pub fn parse(root: &Value, nact: usize) -> Result<Demos, String> {
    if nact == 0 {
        return Err("Training from demos needs at least one joint".to_owned());
    }

    let list = episode_list(root)?;
    let mut demos = Demos {
        nobs: obs_width(nact),
        nact,
        episodes: list.len(),
        train: Rows::default(),
        held: Rows::default(),
    };

    for (index, value) in list.iter().enumerate() {
        episode(value, index, &mut demos)?;

        if demos.rows() > MAX_ROWS {
            return Err(format!("demos.json holds more than {MAX_ROWS} rows"));
        }
    }

    demos.train.actions.iter_mut().for_each(|a| *a = a.clamp(-1.0, 1.0));
    demos.held.actions.iter_mut().for_each(|a| *a = a.clamp(-1.0, 1.0));

    Ok(demos)
}

pub fn load(path: &Path, nact: usize) -> Result<Demos, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Couldn't read {}: {e}", path.display()))?;
    let root: Value = serde_json::from_str(&text).map_err(|e| format!("Couldn't parse demos.json: {e}"))?;

    parse(&root, nact)
}
