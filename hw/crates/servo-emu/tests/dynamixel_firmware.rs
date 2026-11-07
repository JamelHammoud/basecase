use servo_emu::{BusOptions, ServoBus};
use servo_wire::dynamixel::{
    raw_frame, ERR_ACCESS, ERR_ALERT, ERR_CRC, ERR_DATA_LIMIT, ERR_DATA_RANGE, ERR_RESULT_FAIL, OP_REBOOT, OP_WRITE,
};
use servo_wire::{Family, Scan, Status};

struct Bench {
    bus: ServoBus,
    now: u64,
}

impl Bench {
    fn new(ids: &[u8]) -> Self {
        Self {
            bus: ServoBus::new(Family::Dynamixel, ids, BusOptions::default()),
            now: 0,
        }
    }

    fn send(&mut self, bytes: &[u8]) -> Vec<Status> {
        self.now += 1000;

        self.bus
            .feed(bytes, self.now)
            .into_iter()
            .filter_map(|timed| match Family::Dynamixel.scan(&timed.bytes) {
                Scan::Frame(frame) => Family::Dynamixel.status_of(&frame),
                _ => None,
            })
            .collect()
    }

    fn write(&mut self, id: u8, address: u16, data: &[u8]) -> u8 {
        let mut params = address.to_le_bytes().to_vec();

        params.extend_from_slice(data);
        self.send(&raw_frame(id, OP_WRITE, &params))
            .first()
            .map_or(0xEE, |status| status.error)
    }

    fn read(&mut self, id: u8, address: u16, length: u16) -> Status {
        self.send(&Family::Dynamixel.read_request(id, address, length))
            .remove(0)
    }

    fn wait_ms(&mut self, ms: u64) {
        self.now += ms * 1000;
        self.bus.advance_to(self.now);
    }
}

#[test]
fn eeprom_is_locked_while_torque_is_on() {
    let mut bench = Bench::new(&[1]);

    assert_eq!(bench.write(1, 31, &[60]), 0);
    assert_eq!(bench.write(1, 64, &[1]), 0);
    assert_eq!(bench.write(1, 31, &[50]), ERR_ACCESS);
    assert_eq!(bench.read(1, 31, 1).data, vec![60]);
}

#[test]
fn read_only_registers_refuse_writes() {
    let mut bench = Bench::new(&[1]);

    assert_eq!(bench.write(1, 132, &[0, 0, 0, 0]), ERR_ACCESS);
    assert_eq!(bench.write(1, 0, &[1, 2]), ERR_ACCESS);
}

#[test]
fn goals_outside_the_position_limits_are_refused() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 52, &1000u32.to_le_bytes());
    bench.write(1, 64, &[1]);
    assert_eq!(bench.write(1, 116, &500u32.to_le_bytes()), ERR_DATA_LIMIT);
    assert_eq!(bench.write(1, 116, &2100u32.to_le_bytes()), 0);
}

#[test]
fn bus_watchdog_stops_the_servo_and_locks_goals_until_cleared() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 64, &[1]);
    bench.write(1, 98, &[5]);
    bench.write(1, 116, &2400u32.to_le_bytes());
    bench.wait_ms(90);
    assert_eq!(bench.read(1, 98, 1).data, vec![5], "any instruction feeds the watchdog");
    bench.wait_ms(120);
    assert_eq!(bench.read(1, 98, 1).data, vec![0xFF]);

    let counts = |data: Vec<u8>| i32::from_le_bytes([data[0], data[1], data[2], data[3]]);

    bench.wait_ms(1500);

    let settled = counts(bench.read(1, 132, 4).data);

    bench.wait_ms(100);

    let later = counts(bench.read(1, 132, 4).data);
    let goal = counts(bench.read(1, 116, 4).data);

    assert!(
        (later - settled).abs() <= 2,
        "the servo stopped: {settled} then {later}"
    );
    assert!(
        goal < 2400 && (goal - later).abs() <= 40,
        "the goal froze where it was stopped: {goal}"
    );
    assert_eq!(bench.write(1, 116, &2000u32.to_le_bytes()), ERR_DATA_RANGE);
    assert_eq!(bench.read(1, 64, 1).data, vec![1], "torque stays on, per the e-Manual");
    assert_eq!(bench.write(1, 98, &[0]), 0);
    assert_eq!(bench.write(1, 116, &2000u32.to_le_bytes()), 0);
}

#[test]
fn overheating_shuts_down_until_reboot() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 64, &[1]);
    bench.bus.servo_mut(1).unwrap().plant_mut().set_temperature_c(75.0);
    bench.wait_ms(2);

    let status = bench.read(1, 70, 1);

    assert_ne!(status.data[0] & 4, 0);
    assert_ne!(status.error & ERR_ALERT, 0, "every status carries the alert bit");
    assert_eq!(bench.read(1, 64, 1).data, vec![0]);
    assert_eq!(bench.write(1, 64, &[1]), ERR_RESULT_FAIL | ERR_ALERT);

    bench.bus.servo_mut(1).unwrap().plant_mut().set_temperature_c(30.0);
    bench.send(&raw_frame(1, OP_REBOOT, &[]));
    bench.wait_ms(2);
    assert_eq!(bench.read(1, 70, 1).data, vec![0]);
    assert_eq!(bench.write(1, 64, &[1]), 0);
}

#[test]
fn reboot_restores_ram_defaults_and_keeps_eeprom() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 31, &[65]);
    bench.write(1, 84, &100u16.to_le_bytes());
    bench.send(&raw_frame(1, OP_REBOOT, &[]));
    bench.wait_ms(2);
    assert_eq!(bench.read(1, 84, 2).data, 400u16.to_le_bytes().to_vec());
    assert_eq!(bench.read(1, 31, 1).data, vec![65]);
}

#[test]
fn a_corrupt_instruction_gets_a_crc_error_and_missing_ids_stay_silent() {
    let mut bench = Bench::new(&[1]);
    let mut frame = Family::Dynamixel.ping_request(1);
    let last = frame.len() - 1;

    frame[last] ^= 0x01;

    let replies = bench.send(&frame);

    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0].error, ERR_CRC);
    assert!(bench.send(&Family::Dynamixel.ping_request(9)).is_empty());
}

#[test]
fn ping_reports_model_and_firmware() {
    let mut bench = Bench::new(&[4]);
    let status = bench.send(&Family::Dynamixel.ping_request(4)).remove(0);

    assert_eq!(status.data, vec![0xB0, 0x04, 53]);
}

#[test]
fn status_data_with_a_header_inside_is_stuffed_and_survives() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 108, &[0xFF, 0xFF, 0xFD, 0x00]);
    assert_eq!(bench.read(1, 108, 4).data, vec![0xFF, 0xFF, 0xFD, 0x00]);
}

#[test]
fn return_delay_defaults_to_five_hundred_microseconds() {
    let mut bench = Bench::new(&[1]);
    let sent_at = bench.now + 1000;
    let replies = bench.bus.feed(&Family::Dynamixel.ping_request(1), sent_at);

    assert_eq!(replies[0].at_us, sent_at + 500);
}
