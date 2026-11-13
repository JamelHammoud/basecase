use std::net::Ipv4Addr;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkInterface {
    pub name: String,
    pub friendly_name: Option<String>,
    pub loopback: bool,
    pub ipv4: Vec<Ipv4Addr>,
}

impl NetworkInterface {
    fn is_named(&self, name: &str) -> bool {
        self.name == name || self.friendly_name.as_deref() == Some(name)
    }
}

pub fn interface_address(name: &str) -> Result<Ipv4Addr, String> {
    pick_address(&local_interfaces(), name)
}

fn local_interfaces() -> Vec<NetworkInterface> {
    netdev::get_interfaces()
        .into_iter()
        .map(|interface| NetworkInterface {
            loopback: interface.is_loopback(),
            ipv4: interface.ipv4.iter().map(|net| net.addr()).collect(),
            name: interface.name,
            friendly_name: interface.friendly_name,
        })
        .collect()
}

pub fn pick_address(interfaces: &[NetworkInterface], name: &str) -> Result<Ipv4Addr, String> {
    let Some(interface) = interfaces.iter().find(|interface| interface.is_named(name)) else {
        let known: Vec<&str> = interfaces.iter().map(|interface| interface.name.as_str()).collect();

        return Err(format!(
            "No network interface named {name}. This computer has: {}",
            known.join(", ")
        ));
    };

    if interface.loopback {
        return Err(format!(
            "{name} is a loopback interface. Use the interface wired to the robot"
        ));
    }

    let mut usable = interface
        .ipv4
        .iter()
        .filter(|address| !address.is_loopback() && !address.is_unspecified());

    usable
        .next()
        .copied()
        .ok_or_else(|| format!("{name} has no IPv4 address. Connect it to the robot's network first"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interface(name: &str, loopback: bool, ipv4: &[Ipv4Addr]) -> NetworkInterface {
        NetworkInterface {
            name: name.to_string(),
            friendly_name: None,
            loopback,
            ipv4: ipv4.to_vec(),
        }
    }

    fn table() -> Vec<NetworkInterface> {
        vec![
            interface("lo0", true, &[Ipv4Addr::LOCALHOST]),
            interface("en0", false, &[Ipv4Addr::new(192, 168, 123, 99)]),
            interface("en5", false, &[]),
            interface("bridge0", false, &[Ipv4Addr::LOCALHOST]),
        ]
    }

    #[test]
    fn a_named_interface_resolves_to_its_ipv4_address() {
        assert_eq!(pick_address(&table(), "en0"), Ok(Ipv4Addr::new(192, 168, 123, 99)));
    }

    #[test]
    fn an_unknown_name_is_refused_with_the_interfaces_there_are() {
        let message = pick_address(&table(), "eth9").expect_err("unknown");

        assert!(message.starts_with("No network interface named eth9"));
        assert!(message.contains("en0"));
    }

    #[test]
    fn loopback_and_addressless_interfaces_are_refused() {
        assert!(pick_address(&table(), "lo0")
            .expect_err("loopback")
            .contains("loopback"));
        assert!(pick_address(&table(), "en5")
            .expect_err("no address")
            .contains("no IPv4"));
        assert!(pick_address(&table(), "bridge0")
            .expect_err("loopback only")
            .contains("no IPv4"));
    }

    #[test]
    fn a_windows_friendly_name_finds_the_interface() {
        let mut ethernet = interface("{4D36E972}", false, &[Ipv4Addr::new(192, 168, 123, 51)]);

        ethernet.friendly_name = Some("Ethernet".to_string());

        assert_eq!(
            pick_address(&[ethernet], "Ethernet"),
            Ok(Ipv4Addr::new(192, 168, 123, 51))
        );
    }

    #[test]
    fn the_real_loopback_interface_is_refused() {
        let interfaces = local_interfaces();
        let Some(loopback) = interfaces.iter().find(|interface| interface.loopback) else {
            return;
        };

        assert!(interface_address(&loopback.name).is_err());
    }
}
