use plant_bam::{UnitParams, XL330};
use servo_emu::{parts_by_id, BusOptions, ControlGains, M6Params, PartModel, ServoBus};
use servo_wire::feetech::{raw_frame, OP_WRITE};
use servo_wire::Family;

fn xl430() -> PartModel {
    PartModel {
        m6: M6Params {
            kt: 0.9,
            resistance: 4.1,
            armature: 0.01,
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

fn options(seed: u64) -> BusOptions {
    BusOptions {
        seed,
        ..BusOptions::default()
    }
}

fn unit(bus: &ServoBus, id: u8) -> UnitParams {
    bus.unit_of(id).unwrap()
}

#[test]
fn a_servo_given_a_part_draws_its_hidden_parameters_around_that_part() {
    let parts = parts_by_id(&[1, 2], &[Some(xl430()), None]);
    let bus = ServoBus::with_parts(Family::Dynamixel, &[1, 2], options(4), parts);
    let fitted = unit(&bus, 1);

    assert!((fitted.m6.kt / 0.9 - 1.0).abs() <= 0.05, "{}", fitted.m6.kt);
    assert!((fitted.m6.resistance / 4.1 - 1.0).abs() <= 0.08);
    assert!((fitted.supply_scale - 11.1 / 5.0).abs() < 1e-12);
    assert!((400.0 * fitted.gains.error_gain - 640.0 * 0.003).abs() < 1e-12);
}

#[test]
fn a_servo_without_a_part_keeps_the_protocol_default_exactly() {
    for family in [Family::Feetech, Family::Dynamixel] {
        let plain = ServoBus::new(family, &[1, 2, 3], options(9));
        let parts = parts_by_id(&[1, 2, 3], &[Some(xl430()), None, None]);
        let mixed = ServoBus::with_parts(family, &[1, 2, 3], options(9), parts);
        let none = ServoBus::with_parts(
            family,
            &[1, 2, 3],
            options(9),
            parts_by_id(&[1, 2, 3], &[None, None, None]),
        );

        assert_eq!(unit(&plain, 2), unit(&mixed, 2));
        assert_eq!(unit(&plain, 3), unit(&mixed, 3));
        assert_ne!(unit(&plain, 1), unit(&mixed, 1));

        for id in 1..=3 {
            assert_eq!(unit(&plain, id), unit(&none, id));
        }
    }
}

#[test]
fn the_same_seed_draws_the_same_unit_again() {
    let first = ServoBus::with_parts(Family::Feetech, &[1], options(5), parts_by_id(&[1], &[Some(xl430())]));
    let again = ServoBus::with_parts(Family::Feetech, &[1], options(5), parts_by_id(&[1], &[Some(xl430())]));
    let other = ServoBus::with_parts(Family::Feetech, &[1], options(6), parts_by_id(&[1], &[Some(xl430())]));

    assert_eq!(unit(&first, 1), unit(&again, 1));
    assert_ne!(unit(&first, 1).m6.kt, unit(&other, 1).m6.kt);
}

fn write(bus: &mut ServoBus, now: &mut u64, (id, address, value): (u8, u8, u8)) {
    *now += 1000;
    bus.feed(&raw_frame(id, OP_WRITE, &[address, value]), *now);
}

#[test]
fn a_new_servo_becomes_the_part_of_the_id_it_is_given() {
    let parts = parts_by_id(&[1, 3], &[None, Some(xl430())]);
    let mut bus = ServoBus::factory_with_parts(Family::Feetech, options(2), parts);
    let mut now = 0;

    bus.plug_in_new_servo();

    let at_factory_id = unit(&bus, 1);

    write(&mut bus, &mut now, (1, 55, 0));
    write(&mut bus, &mut now, (1, 5, 3));

    let renumbered = unit(&bus, 3);

    assert_ne!(at_factory_id, renumbered);
    assert!((renumbered.m6.kt / 0.9 - 1.0).abs() <= 0.05);
    assert!((renumbered.supply_scale - 11.1 / 7.4).abs() < 1e-12);
}

#[test]
fn present_voltage_reads_the_bus_supply_whatever_the_part_is_rated_at() {
    let parts = parts_by_id(&[1], &[Some(xl430())]);
    let mut bus = ServoBus::with_parts(Family::Feetech, &[1], options(1), parts);

    bus.advance_to(20_000);

    assert_eq!(bus.servo(1).unwrap().register(62), 74);
}
