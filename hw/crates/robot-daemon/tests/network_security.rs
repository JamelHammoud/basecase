use robot_daemon::network::{bounded_line, private_address, session_mac, verify_mac};
use std::io::{BufReader, Cursor, Read};
use std::net::IpAddr;

#[test]
fn public_wildcard_and_mapped_public_addresses_are_refused() {
    for address in [
        "0.0.0.0",
        "8.8.8.8",
        "100.64.0.1",
        "::",
        "2001:4860:4860::8888",
        "::ffff:8.8.8.8",
    ] {
        assert!(!private_address(address.parse::<IpAddr>().unwrap()), "{address}");
    }
    for address in [
        "127.0.0.1",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.9",
        "169.254.1.1",
        "::1",
        "fd00::1",
        "fe80::1",
        "::ffff:192.168.1.9",
    ] {
        assert!(private_address(address.parse::<IpAddr>().unwrap()), "{address}");
    }
}

#[test]
fn oversized_and_unterminated_lines_fail_before_json_or_commands() {
    let mut reader = BufReader::new(std::io::repeat(b'x').take(1024 * 1024 * 1024));
    assert!(bounded_line(&mut reader, 64).is_err());
    assert!(bounded_line(&mut BufReader::new(Cursor::new(b"{}")), 64).is_err());
    assert_eq!(
        bounded_line(&mut BufReader::new(Cursor::new(b"{}\n")), 64).unwrap(),
        "{}"
    );
}

#[test]
fn commands_are_bound_to_nonce_sequence_and_exact_body() {
    let key = [0x5au8; 32];
    let mac = session_mac(&key, "nonce-one", 1, r#"{"cmd":"heartbeat"}"#);
    assert!(verify_mac(&key, "nonce-one", 1, r#"{"cmd":"heartbeat"}"#, &mac));
    assert!(!verify_mac(&key, "nonce-two", 1, r#"{"cmd":"heartbeat"}"#, &mac));
    assert!(!verify_mac(&key, "nonce-one", 2, r#"{"cmd":"heartbeat"}"#, &mac));
    assert!(!verify_mac(&key, "nonce-one", 1, r#"{"cmd":"stop"}"#, &mac));
}

#[test]
fn hmac_matches_the_published_rfc4231_test_vector() {
    let mut key = [0u8; 32];
    key[..20].fill(0x0b);
    assert_eq!(
        robot_daemon::network::hmac(&key, "Hi There"),
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    );
}

#[test]
fn spake2_requires_the_same_code_and_binds_encryption_to_the_transcript() {
    use robot_daemon::network::enrollment::{decrypt, encrypt, transcript, Exchange};
    let server = Exchange::server("123456");
    let client = Exchange::client("123456");
    let server_message = server.message.clone();
    let client_message = client.message.clone();
    let nonce = "a1".repeat(32);
    let server_key = server.finish(&client_message, &nonce).unwrap();
    let client_key = client.finish(&server_message, &nonce).unwrap();
    assert_eq!(server_key, client_key);
    let context = transcript(&nonce, &server_message, &client_message);
    let encrypted = encrypt(&server_key, &context, &[17u8; 32]).unwrap();
    assert_eq!(decrypt(&client_key, &context, &encrypted).unwrap(), [17u8; 32]);
    assert!(decrypt(&client_key, &format!("{context}changed"), &encrypted).is_err());
    let server = Exchange::server("123456");
    let wrong = Exchange::client("654321");
    let server_message = server.message.clone();
    let wrong_message = wrong.message.clone();
    assert_ne!(
        server.finish(&wrong_message, &nonce).unwrap(),
        wrong.finish(&server_message, &nonce).unwrap()
    );
}

#[test]
fn pairing_consumption_survives_restart_and_keeps_the_same_restricted_key_file() {
    use robot_daemon::network::Pairing;
    let directory = std::env::temp_dir().join(format!(
        "pairing-persistence-{}",
        robot_daemon::network::random_hex().unwrap()
    ));
    let mut pairing = Pairing::load(&directory, Some("123456")).unwrap();
    let original = pairing.key.clone();
    let original_id = pairing.robot_id().unwrap();
    pairing.consume(&directory).unwrap();
    let restarted = Pairing::load(&directory, Some("999999")).unwrap();
    assert_eq!(restarted.key, original);
    assert_eq!(restarted.robot_id().unwrap(), original_id);
    assert_eq!(restarted.code, None);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(directory.join("pairing.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn robot_identity_hashes_the_decoded_permanent_key() {
    let pairing = robot_daemon::network::Pairing {
        key: "00".repeat(32),
        code: None,
    };
    assert_eq!(
        pairing.robot_id().unwrap(),
        "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925"
    );
    let lower = robot_daemon::network::Pairing {
        key: "ab".repeat(32),
        code: None,
    };
    let upper = robot_daemon::network::Pairing {
        key: "AB".repeat(32),
        code: None,
    };
    assert_eq!(lower.robot_id().unwrap(), upper.robot_id().unwrap());
}

#[test]
fn a_private_pairing_seed_is_consumed_after_creating_or_loading_credentials() {
    use robot_daemon::network::Pairing;
    let directory = std::env::temp_dir().join(format!("pairing-seed-{}", robot_daemon::network::random_hex().unwrap()));
    std::fs::create_dir_all(&directory).unwrap();
    let seed = directory.join("pairing-code.seed");
    std::fs::write(&seed, "123456\n").unwrap();
    let first = Pairing::load_seed(&directory, None, Some(&seed)).unwrap();
    assert_eq!(first.code.as_deref(), Some("123456"));
    assert!(!seed.exists());
    std::fs::write(&seed, "654321").unwrap();
    let restarted = Pairing::load_seed(&directory, None, Some(&seed)).unwrap();
    assert_eq!(restarted.key, first.key);
    assert_eq!(restarted.code, first.code);
    assert!(!seed.exists());
    std::fs::remove_file(directory.join("pairing.json")).unwrap();
    let reset = Pairing::load_seed(&directory, None, Some(&seed)).unwrap();
    assert_ne!(reset.key, first.key);
    assert_eq!(reset.code.as_ref().unwrap().len(), 6);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn a_rejected_pairing_seed_stays_available_until_credentials_can_be_created() {
    use robot_daemon::network::Pairing;
    let directory = std::env::temp_dir().join(format!(
        "pairing-seed-refused-{}",
        robot_daemon::network::random_hex().unwrap()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let seed = directory.join("pairing-code.seed");
    std::fs::write(&seed, "bad-code").unwrap();
    assert!(Pairing::load_seed(&directory, None, Some(&seed)).is_err());
    assert!(seed.exists());
    assert!(!directory.join("pairing.json").exists());
    assert!(Pairing::load_seed(&directory, Some("123456"), Some(&seed)).is_err());
    assert!(seed.exists());
    std::fs::remove_dir_all(directory).unwrap();
}
