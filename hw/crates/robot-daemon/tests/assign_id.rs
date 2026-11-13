mod common;

use common::{assert_beginner_message, Rig};
use faultbox::Schedule;
use robot_daemon::ladder::Mode;
use robot_daemon::{Command, DaemonEvent};
use servo_wire::Family;

const FAMILIES: [Family; 2] = [Family::Feetech, Family::Dynamixel];

fn id_address(family: Family) -> u16 {
    match family {
        Family::Feetech => 5,
        Family::Dynamixel => 7,
    }
}

fn in_set_up(family: Family) -> Rig {
    let mut rig = Rig::factory(family, Schedule::new());

    rig.command(Command::Enter(Mode::SetUp))
        .expect("set up takes a bus whose servos are still in the bag");
    rig.ticks(3);

    rig
}

fn id_writes(rig: &Rig) -> usize {
    rig.writes()
        .iter()
        .filter(|write| write.address == id_address(rig.family))
        .count()
}

fn assigned(rig: &Rig) -> Vec<u8> {
    rig.events
        .iter()
        .filter_map(|event| match event {
            DaemonEvent::Assigned { id, .. } => Some(*id),
            _ => None,
        })
        .collect()
}

fn refusal(rig: &mut Rig, id: u8) -> String {
    let message = rig.assign(id).expect_err("the assignment should be refused");

    assert_beginner_message(&message);
    assert!(
        rig.events
            .iter()
            .any(|event| matches!(event, DaemonEvent::Refused { message: said } if *said == message)),
        "the refusal reaches the app"
    );

    message
}

#[test]
fn assign_id_writes_and_reads_back_on_a_single_factory_servo() {
    for family in FAMILIES {
        let mut rig = in_set_up(family);

        for id in [3, 2, 1] {
            rig.plug_in();
            rig.assign(id)
                .unwrap_or_else(|message| panic!("{family:?} id {id}: {message}"));
            rig.ticks(3);
        }

        assert_eq!(assigned(&rig), vec![3, 2, 1]);
        assert_eq!(rig.servo_ids(), vec![3, 2, 1]);
        assert_eq!(id_writes(&rig), 2, "the servo that stays at ID 1 is only read back");

        for id in [3, 2] {
            rig.bus.lock().unwrap().servo_mut(id).unwrap().power_cycle(rig.now());
        }

        assert_eq!(rig.servo_ids(), vec![3, 2, 1], "IDs survive a power cycle");

        if family == Family::Feetech {
            assert_eq!(rig.servo_register(3, 55), 1, "the EEPROM is locked again");
        }

        rig.command(Command::Enter(Mode::Test))
            .expect("every servo answers at its ID, so the ladder climbs");
        assert!(rig.tick_until(80, Rig::running), "{family:?} never started Test");
    }
}

#[test]
fn test_waits_until_every_servo_has_its_id() {
    for family in FAMILIES {
        let mut rig = in_set_up(family);

        rig.plug_in();
        rig.assign(3).unwrap();

        let message = rig.command(Command::Enter(Mode::Test)).unwrap_err();

        assert!(message.contains("Servo 1 doesn't answer"), "{message}");
        assert_beginner_message(&message);
        assert_eq!(rig.daemon.mode(), Mode::SetUp);
    }
}

#[test]
fn assign_id_refuses_with_two_new_servos_on_the_bus() {
    for family in FAMILIES {
        let mut twins = in_set_up(family);

        twins.plug_in();
        twins.plug_in();
        assert!(refusal(&mut twins, 3).contains("More than one new servo"));
        assert_eq!(id_writes(&twins), 0);

        let mut stranger = in_set_up(family);

        stranger.plug_in();
        stranger.bus.lock().unwrap().add_servo(9);
        assert!(refusal(&mut stranger, 3).contains("More than one new servo"));
        assert_eq!(id_writes(&stranger), 0);
    }
}

#[test]
fn assign_id_refuses_with_no_new_servo() {
    for family in FAMILIES {
        let mut rig = in_set_up(family);

        assert!(refusal(&mut rig, 3).contains("No new servo"));
        rig.plug_in();
        rig.assign(3).unwrap();
        assert!(refusal(&mut rig, 2).contains("No new servo"));
        assert_eq!(id_writes(&rig), 1);
    }
}

#[test]
fn assign_id_refuses_outside_set_up() {
    for family in FAMILIES {
        let mut look = Rig::factory(family, Schedule::new());

        look.plug_in();
        assert!(refusal(&mut look, 3).contains("in Set up"));

        let mut testing = Rig::new(family, Schedule::new());

        testing.start_test();
        assert!(refusal(&mut testing, 2).contains("in Set up"));
        assert_eq!(id_writes(&look) + id_writes(&testing), 0);
    }
}

#[test]
fn assign_id_refuses_with_the_motor_on() {
    for family in FAMILIES {
        let mut rig = in_set_up(family);
        let torque_on = match family {
            Family::Feetech => servo_wire::feetech::raw_frame(1, servo_wire::feetech::OP_WRITE, &[40, 1]),
            Family::Dynamixel => servo_wire::dynamixel::raw_frame(1, servo_wire::dynamixel::OP_WRITE, &[64, 0, 1]),
        };

        rig.plug_in();
        rig.bus.lock().unwrap().feed(&torque_on, rig.now());
        assert!(rig.torque_on(1));
        assert!(refusal(&mut rig, 3).contains("motor is on"));
        assert_eq!(id_writes(&rig), 0);
    }
}

#[test]
fn assign_id_refuses_an_id_already_taken() {
    for family in FAMILIES {
        let mut rig = in_set_up(family);

        rig.bus.lock().unwrap().add_servo(2);
        rig.plug_in();
        assert!(refusal(&mut rig, 2).contains("already has ID 2"));
        assert!(refusal(&mut rig, 7).contains("no servo 7"));
        assert_eq!(id_writes(&rig), 0);
    }
}

#[test]
fn set_up_still_refuses_a_bus_with_two_servos_at_one_id() {
    for family in FAMILIES {
        let mut rig = Rig::factory(family, Schedule::new());

        rig.plug_in();
        rig.plug_in();

        let message = rig.command(Command::Enter(Mode::SetUp)).unwrap_err();

        assert_beginner_message(&message);
        assert_eq!(rig.daemon.mode(), Mode::Look);
        assert_eq!(rig.writes(), Vec::new());
    }
}
