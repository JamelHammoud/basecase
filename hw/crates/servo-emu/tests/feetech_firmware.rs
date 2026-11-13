use servo_emu::{BusOptions, ServoBus};
use servo_wire::feetech::{raw_frame, ERR_OVERCURRENT, ERR_OVERLOAD, OP_SYNC_WRITE, OP_WRITE};
use servo_wire::{Family, Scan, Status};

struct Bench {
    bus: ServoBus,
    now: u64,
}

impl Bench {
    fn new(ids: &[u8]) -> Self {
        Self {
            bus: ServoBus::new(Family::Feetech, ids, BusOptions::default()),
            now: 0,
        }
    }

    fn send(&mut self, bytes: &[u8]) -> Vec<(u64, Status)> {
        self.now += 1000;

        self.bus
            .feed(bytes, self.now)
            .into_iter()
            .filter_map(|timed| match Family::Feetech.scan(&timed.bytes) {
                Scan::Frame(frame) => Family::Feetech.status_of(&frame).map(|status| (timed.at_us, status)),
                _ => None,
            })
            .collect()
    }

    fn write(&mut self, id: u8, address: u8, data: &[u8]) -> Vec<(u64, Status)> {
        let mut params = vec![address];

        params.extend_from_slice(data);
        self.send(&raw_frame(id, OP_WRITE, &params))
    }

    fn read(&mut self, id: u8, address: u8, length: u8) -> Status {
        self.send(&Family::Feetech.read_request(id, u16::from(address), u16::from(length)))
            .remove(0)
            .1
    }

    fn wait_ms(&mut self, ms: u64) {
        self.now += ms * 1000;
        self.bus.advance_to(self.now);
    }

    fn load_permille(&mut self, id: u8) -> i32 {
        let data = self.read(id, 60, 2).data;
        let raw = u16::from_le_bytes([data[0], data[1]]);

        i32::from(raw & 0x3FF) * if raw & 0x400 != 0 { -1 } else { 1 }
    }

    fn stall_and_push(&mut self, id: u8) {
        self.bus.servo_mut(id).unwrap().plant_mut().faults.stuck = true;
        self.write(id, 40, &[1]);
        self.write(id, 42, &3000u16.to_le_bytes());
    }
}

#[test]
fn overload_unloads_to_the_protective_torque_and_clears_on_a_new_command() {
    let mut bench = Bench::new(&[1]);

    bench.stall_and_push(1);
    bench.wait_ms(1000);
    assert_eq!(
        bench.read(1, 65, 1).data[0] & ERR_OVERLOAD,
        0,
        "trips only after the protection time"
    );
    assert!(bench.load_permille(1) > 800);
    bench.wait_ms(1100);

    let status = bench.read(1, 65, 1);

    assert_ne!(status.data[0] & ERR_OVERLOAD, 0);
    assert_ne!(
        status.error & ERR_OVERLOAD,
        0,
        "the status packet carries the overload bit"
    );
    assert!(bench.load_permille(1) <= 200, "unloaded to the protective torque (20%)");

    bench.write(1, 42, &3001u16.to_le_bytes());
    bench.wait_ms(5);
    assert_eq!(
        bench.read(1, 65, 1).data[0] & ERR_OVERLOAD,
        0,
        "a new command clears it"
    );
    assert!(bench.load_permille(1) > 800);
}

#[test]
fn overcurrent_cuts_output_to_zero_and_clears_on_a_new_command() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 28, &50u16.to_le_bytes());
    bench.write(1, 38, &[10]);
    bench.stall_and_push(1);
    bench.wait_ms(150);

    assert_ne!(bench.read(1, 65, 1).data[0] & ERR_OVERCURRENT, 0);
    assert_eq!(bench.load_permille(1), 0, "overcurrent unloads to zero");

    bench.write(1, 40, &[1]);
    bench.wait_ms(5);
    assert_eq!(bench.read(1, 65, 1).data[0] & ERR_OVERCURRENT, 0);
}

#[test]
fn eeprom_writes_survive_power_only_when_unlocked() {
    let mut bench = Bench::new(&[1]);

    bench.write(1, 13, &[60]);
    assert_eq!(bench.read(1, 13, 1).data, vec![60]);
    bench.bus.servo_mut(1).unwrap().power_cycle(bench.now);
    assert_eq!(
        bench.read(1, 13, 1).data,
        vec![70],
        "lock = 1 keeps EEPROM writes in RAM only"
    );

    bench.write(1, 55, &[0]);
    bench.write(1, 13, &[60]);
    bench.bus.servo_mut(1).unwrap().power_cycle(bench.now);
    assert_eq!(bench.read(1, 13, 1).data, vec![60]);
}

#[test]
fn a_goal_write_switches_torque_on() {
    let mut bench = Bench::new(&[1]);

    assert_eq!(bench.read(1, 40, 1).data, vec![0]);
    bench.write(1, 42, &2048u16.to_le_bytes());
    assert_eq!(bench.read(1, 40, 1).data, vec![1]);
}

#[test]
fn missing_ids_stay_silent_and_return_delay_is_honoured() {
    let mut bench = Bench::new(&[1, 2]);

    assert!(bench.send(&Family::Feetech.ping_request(9)).is_empty());
    bench.write(2, 7, &[250]);

    let sent_at = bench.now + 1000;
    let replies = bench.send(&Family::Feetech.ping_request(2));

    assert_eq!(replies[0].0, sent_at + 500);
}

#[test]
fn broadcast_ping_answers_in_id_order_and_broadcast_writes_answer_nobody() {
    let mut bench = Bench::new(&[3, 1, 2]);
    let replies = bench.send(&Family::Feetech.ping_request(0xFE));
    let ids: Vec<u8> = replies.iter().map(|(_, status)| status.id).collect();

    assert_eq!(ids, vec![1, 2, 3]);
    assert!(replies.windows(2).all(|pair| pair[0].0 < pair[1].0));
    assert!(bench.write(0xFE, 40, &[1]).is_empty());
    assert_eq!(bench.read(2, 40, 1).data, vec![1]);
}

#[test]
fn sync_write_reaches_only_the_listed_servos() {
    let mut bench = Bench::new(&[1, 2, 3]);
    let params = [48, 2, 1, 0x2C, 0x01, 3, 0x2C, 0x01];

    assert!(bench.send(&raw_frame(0xFE, OP_SYNC_WRITE, &params)).is_empty());
    assert_eq!(bench.read(1, 48, 2).data, vec![0x2C, 0x01]);
    assert_eq!(bench.read(2, 48, 2).data, vec![0xE8, 0x03]);
    assert_eq!(bench.read(3, 48, 2).data, vec![0x2C, 0x01]);
}

#[test]
fn response_level_zero_silences_writes_but_not_reads() {
    let mut bench = Bench::new(&[1]);

    assert!(
        bench.write(1, 8, &[0]).is_empty(),
        "the new level applies to its own write"
    );
    assert!(bench.write(1, 41, &[5]).is_empty());
    assert_eq!(bench.read(1, 41, 1).data, vec![5]);
}

#[test]
fn a_corrupt_instruction_gets_no_answer() {
    let mut bench = Bench::new(&[1]);
    let mut frame = Family::Feetech.ping_request(1);

    frame[4] ^= 0x01;
    assert!(bench.send(&frame).is_empty());
    assert_eq!(bench.send(&Family::Feetech.ping_request(1)).len(), 1);
}

#[test]
fn a_half_sent_instruction_is_forgotten_after_a_pause() {
    let mut bench = Bench::new(&[1]);
    let ping = Family::Feetech.ping_request(1);

    assert!(bench.send(&ping[..3]).is_empty());
    bench.wait_ms(100);
    assert_eq!(bench.send(&ping).len(), 1);
}

#[test]
fn a_factory_bus_starts_empty_and_new_servos_arrive_at_id_1() {
    let mut bench = Bench {
        bus: ServoBus::factory(Family::Feetech, BusOptions::default()),
        now: 0,
    };

    assert!(bench.bus.servo_ids().is_empty());
    bench.bus.plug_in_new_servo();
    assert_eq!(bench.bus.servo_ids(), vec![servo_emu::FACTORY_ID]);
    assert_eq!(bench.read(1, 3, 2).data, 777u16.to_le_bytes().to_vec());

    bench.write(1, 55, &[0]);
    bench.write(1, 5, &[3]);
    bench.write(3, 55, &[1]);
    bench.bus.plug_in_new_servo();
    bench.bus.servo_mut(3).unwrap().power_cycle(bench.now);
    assert_eq!(
        bench.bus.servo_ids(),
        vec![3, 1],
        "a renumbered servo keeps its ID through a power cycle"
    );
}
