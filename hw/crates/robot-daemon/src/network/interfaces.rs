use super::private_address;
use std::net::{IpAddr, SocketAddr, SocketAddrV6};

struct Address {
    name: String,
    ip: IpAddr,
    index: u32,
}

#[derive(Default)]
pub struct InterfaceListener {
    pub name: Option<String>,
    pub port: Option<u16>,
    pub ipv6: bool,
}

impl InterfaceListener {
    pub fn resolve(self, numeric: Option<SocketAddr>) -> Result<Option<SocketAddr>, String> {
        let Some(name) = self.name else {
            if self.port.is_some() || self.ipv6 {
                return Err("--listen-port and --listen-ipv6 need --listen-interface.".into());
            }

            return Ok(numeric);
        };

        if numeric.is_some() {
            return Err("Choose either --listen or --listen-interface.".into());
        }

        listen_address(&name, self.port.unwrap_or(7447), self.ipv6).map(Some)
    }
}

fn addresses() -> Result<Vec<Address>, String> {
    Ok(if_addrs::get_if_addrs()
        .map_err(|error| format!("The robot network interfaces couldn't be read: {error}"))?
        .into_iter()
        .filter(|interface| interface.is_oper_up())
        .map(|interface| Address {
            ip: interface.ip(),
            index: interface.index.unwrap_or(0),
            name: interface_name(&interface),
        })
        .collect())
}

#[cfg(windows)]
fn interface_name(interface: &if_addrs::Interface) -> String {
    interface.adapter_name.trim_matches(['{', '}']).to_string()
}

#[cfg(not(windows))]
fn interface_name(interface: &if_addrs::Interface) -> String {
    interface.name.clone()
}

pub fn checked_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 63
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.:-".contains(&byte))
}

pub fn interface_for(address: &str) -> Result<String, String> {
    let ip: IpAddr = address.parse().map_err(|_| "Choose the robot's private IP address.")?;

    interface_of(&addresses()?, ip)
}

fn interface_of(addresses: &[Address], ip: IpAddr) -> Result<String, String> {
    if !private_address(ip) {
        return Err("Choose the robot's private IP address.".into());
    }

    let interface = addresses
        .iter()
        .find(|address| address.ip == ip && checked_name(&address.name))
        .ok_or("The private IP address doesn't belong to an active robot network interface.")?;

    Ok(interface.name.clone())
}

pub fn listen_address(name: &str, port: u16, ipv6: bool) -> Result<SocketAddr, String> {
    address_on(&addresses()?, name, port, ipv6)
}

fn address_on(addresses: &[Address], name: &str, port: u16, ipv6: bool) -> Result<SocketAddr, String> {
    if !checked_name(name) {
        return Err(
            "Choose a network interface name with letters, numbers, dots, underscores, colons or hyphens.".into(),
        );
    }

    let address = addresses
        .iter()
        .filter(|address| address.name == name && address.ip.is_ipv6() == ipv6 && private_address(address.ip))
        .min_by_key(|address| (link_local(address.ip), address.ip))
        .ok_or("The selected robot network interface has no private address in this address family.")?;

    Ok(match address.ip {
        IpAddr::V4(ip) => SocketAddr::new(IpAddr::V4(ip), port),
        IpAddr::V6(ip) => SocketAddr::V6(SocketAddrV6::new(ip, port, 0, address.index)),
    })
}

fn link_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_link_local(),
        IpAddr::V6(ip) => ip.segments()[0] & 0xffc0 == 0xfe80,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address(name: &str, ip: &str) -> Address {
        Address {
            name: name.into(),
            ip: ip.parse().unwrap(),
            index: 7,
        }
    }

    #[test]
    fn the_installed_interface_follows_a_changed_dhcp_address() {
        let installed = vec![address("eth0", "192.168.1.5")];
        let name = interface_of(&installed, "192.168.1.5".parse().unwrap()).unwrap();
        let restarted = vec![address("vpn0", "10.1.1.1"), address("eth0", "192.168.1.42")];

        assert_eq!(
            address_on(&restarted, &name, 7447, false).unwrap(),
            "192.168.1.42:7447".parse::<SocketAddr>().unwrap()
        );
        assert!(address_on(&restarted, "missing0", 7447, false).is_err());
        assert!(interface_of(&restarted, "192.168.1.5".parse().unwrap()).is_err());
    }

    #[test]
    fn interface_selection_refuses_public_addresses_and_keeps_the_installed_address_family() {
        let available = vec![
            address("eth0", "8.8.8.8"),
            address("vpn0", "192.168.1.8"),
            address("eth0", "fd00::42"),
        ];

        assert!(interface_of(&available, "8.8.8.8".parse().unwrap()).is_err());
        assert!(address_on(&available, "eth0", 7447, false).is_err());
        assert_eq!(
            address_on(&available, "eth0", 7447, true).unwrap(),
            SocketAddr::V6(SocketAddrV6::new("fd00::42".parse().unwrap(), 7447, 0, 7))
        );
    }

    #[test]
    fn interface_tokens_cannot_add_shell_or_service_arguments() {
        for name in ["", "eth0 x", "eth0\n", "$(id)", "${HOME}", "%h", "eth0/other"] {
            assert!(!checked_name(name), "{name}");
        }

        assert!(checked_name("enp0s3.10:1"));
    }

    #[test]
    fn interface_ports_never_enable_a_listener_without_an_explicit_interface() {
        assert_eq!(InterfaceListener::default().resolve(None), Ok(None));
        assert_eq!(
            InterfaceListener::default().resolve(Some("127.0.0.1:7447".parse().unwrap())),
            Ok(Some("127.0.0.1:7447".parse().unwrap()))
        );
        assert!(InterfaceListener {
            port: Some(7447),
            ..Default::default()
        }
        .resolve(None)
        .is_err());
        assert!(InterfaceListener {
            ipv6: true,
            ..Default::default()
        }
        .resolve(None)
        .is_err());
        assert!(InterfaceListener {
            name: Some("eth0".into()),
            ..Default::default()
        }
        .resolve(Some("127.0.0.1:7447".parse().unwrap()))
        .is_err());
    }
}
