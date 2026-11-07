use crate::bus::CliFault;
use servo_wire::Family;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliOptions {
    pub family: Family,
    pub ids: Vec<u8>,
    pub pty: bool,
    pub fault: CliFault,
    pub seed: u64,
}

pub fn parse(args: &[String]) -> Result<CliOptions, String> {
    let mut family = None;
    let mut ids = Vec::new();
    let mut pty = false;
    let mut fault = CliFault::None;
    let mut seed = 1;
    let mut rest = args.iter();

    while let Some(flag) = rest.next() {
        match flag.as_str() {
            "--family" => family = Some(parse_family(next_value(&mut rest, flag)?)?),
            "--ids" => ids = parse_ids(next_value(&mut rest, flag)?)?,
            "--pty" => pty = true,
            "--fault" => fault = parse_fault(next_value(&mut rest, flag)?)?,
            "--seed" => seed = parse_seed(next_value(&mut rest, flag)?)?,
            other => return Err(format!("Unknown option {other}")),
        }
    }

    let family = family.ok_or("--family is required: feetech or dynamixel")?;

    if ids.is_empty() {
        return Err("--ids is required, for example 1,2,3".into());
    }

    Ok(CliOptions {
        family,
        ids,
        pty,
        fault,
        seed,
    })
}

fn next_value<'a>(rest: &mut std::slice::Iter<'a, String>, flag: &str) -> Result<&'a str, String> {
    rest.next()
        .map(String::as_str)
        .ok_or_else(|| format!("{flag} needs a value"))
}

fn parse_family(value: &str) -> Result<Family, String> {
    match value {
        "feetech" => Ok(Family::Feetech),
        "dynamixel" => Ok(Family::Dynamixel),
        other => Err(format!("Unknown family {other}")),
    }
}

fn parse_ids(value: &str) -> Result<Vec<u8>, String> {
    value
        .split(',')
        .map(|id| id.trim().parse::<u8>().map_err(|_| format!("Bad servo id {id}")))
        .collect()
}

fn parse_seed(value: &str) -> Result<u64, String> {
    value.parse().map_err(|_| format!("Bad seed {value}"))
}

fn parse_fault(value: &str) -> Result<CliFault, String> {
    match value {
        "bad-checksum" => Ok(CliFault::BadChecksum),
        "wrong-model" => Ok(CliFault::WrongModel),
        "silent" => Ok(CliFault::Silent),
        "wrong-id" => Ok(CliFault::WrongId),
        "truncated" => Ok(CliFault::Truncated),
        other => Err(format!("Unknown fault {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(text: &str) -> Vec<String> {
        text.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn reads_the_documented_form() {
        let parsed = parse(&args("--family dynamixel --ids 1,2,3 --pty --fault wrong-model")).unwrap();

        assert_eq!(parsed.family, Family::Dynamixel);
        assert_eq!(parsed.ids, vec![1, 2, 3]);
        assert!(parsed.pty);
        assert_eq!(parsed.fault, CliFault::WrongModel);
    }

    #[test]
    fn refuses_what_it_does_not_know() {
        assert!(parse(&args("--family stepper --ids 1")).is_err());
        assert!(parse(&args("--family feetech")).is_err());
        assert!(parse(&args("--ids 1")).is_err());
        assert!(parse(&args("--family feetech --ids 300")).is_err());
        assert!(parse(&args("--family feetech --ids 1 --fault gremlins")).is_err());
    }
}
