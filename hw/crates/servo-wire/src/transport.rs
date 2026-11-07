#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportError {
    Disconnected,
}

pub trait ByteTransport: Send {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<(), TransportError>;

    fn read_bytes(&mut self, out: &mut [u8], timeout_micros: u64) -> Result<usize, TransportError>;
}
