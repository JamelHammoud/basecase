use crate::dynamixel::table::FACTORY_POSITION_P;
use crate::feetech::table::FACTORY_P_GAIN;
use plant_bam::{ControlGains, M6Params, PartModel, UnitParams, STS3215_7V4, XL330};
use servo_wire::Family;

pub type PartsById = Vec<(u8, PartModel)>;

pub fn parts_by_id(ids: &[u8], units: &[Option<PartModel>]) -> PartsById {
    ids.iter()
        .zip(units)
        .filter_map(|(id, unit)| unit.map(|part| (*id, part)))
        .collect()
}

pub fn supply_volts(family: Family) -> (f64, f64) {
    match family {
        Family::Feetech => (7.4, 3.5),
        Family::Dynamixel => (5.0, 3.0),
    }
}

fn protocol_default(family: Family) -> (M6Params, ControlGains) {
    match family {
        Family::Feetech => STS3215_7V4,
        Family::Dynamixel => XL330,
    }
}

pub fn factory_p_gain(family: Family) -> f64 {
    match family {
        Family::Feetech => f64::from(FACTORY_P_GAIN),
        Family::Dynamixel => f64::from(FACTORY_POSITION_P),
    }
}

pub fn unit_for(family: Family, part: Option<&PartModel>, seed: u64, id: u8) -> UnitParams {
    let Some(part) = part else {
        return UnitParams::from_seed(protocol_default(family), seed, id);
    };
    let gains = ControlGains {
        error_gain: part.firmware_kp * part.gains.error_gain / factory_p_gain(family),
        ..part.gains
    };
    let mut unit = UnitParams::from_seed((part.m6, gains), seed, id);

    unit.supply_scale = part.volts / supply_volts(family).0;

    unit
}

#[cfg(test)]
mod tests {
    use super::*;

    fn xl430() -> PartModel {
        PartModel {
            m6: M6Params {
                kt: 0.9,
                resistance: 4.1,
                ..XL330.0
            },
            gains: ControlGains {
                error_gain: 0.003,
                ..XL330.1
            },
            firmware_kp: 640.0,
            volts: 11.1,
        }
    }

    #[test]
    fn no_part_keeps_the_protocol_default_unit() {
        assert_eq!(
            unit_for(Family::Feetech, None, 7, 3),
            UnitParams::from_seed(STS3215_7V4, 7, 3)
        );
        assert_eq!(
            unit_for(Family::Dynamixel, None, 7, 3),
            UnitParams::from_seed(XL330, 7, 3)
        );
    }

    #[test]
    fn a_part_matches_its_model_at_the_factory_p_gain() {
        let part = xl430();
        let unit = unit_for(Family::Dynamixel, Some(&part), 1, 2);
        let on_bus = factory_p_gain(Family::Dynamixel) * unit.gains.error_gain;

        assert!((on_bus - part.firmware_kp * part.gains.error_gain).abs() < 1e-12);
        assert!((unit.supply_scale - 11.1 / 5.0).abs() < 1e-12);
    }

    #[test]
    fn a_feetech_part_scales_its_gain_to_the_feetech_register() {
        let unit = unit_for(Family::Feetech, Some(&xl430()), 1, 2);

        assert!((unit.gains.error_gain - 640.0 * 0.003 / 32.0).abs() < 1e-12);
        assert!((unit.supply_scale - 11.1 / 7.4).abs() < 1e-12);
    }

    #[test]
    fn parts_follow_their_ids_and_skip_the_defaults() {
        let part = xl430();
        let parts = parts_by_id(&[4, 5, 6], &[Some(part), None, Some(part)]);

        assert_eq!(parts.iter().map(|(id, _)| *id).collect::<Vec<_>>(), vec![4, 6]);
    }
}
