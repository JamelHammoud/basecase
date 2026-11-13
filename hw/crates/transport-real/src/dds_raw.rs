use rustdds::bytes::Bytes;
use rustdds::no_key::{Decode, DefaultDecoder, DeserializerAdapter, SerializerAdapter};
use rustdds::RepresentationIdentifier;
use std::convert::Infallible;

pub const CDR_LE_HEADER: [u8; 4] = [0x00, 0x01, 0x00, 0x00];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawSample {
    body: Bytes,
}

impl RawSample {
    pub fn from_payload(payload: &[u8]) -> Option<Self> {
        let body = payload.strip_prefix(&CDR_LE_HEADER)?;

        Some(Self {
            body: Bytes::copy_from_slice(body),
        })
    }

    pub fn into_payload(self) -> Vec<u8> {
        let mut payload = Vec::with_capacity(CDR_LE_HEADER.len() + self.body.len());

        payload.extend_from_slice(&CDR_LE_HEADER);
        payload.extend_from_slice(&self.body);
        payload
    }
}

pub struct RawAdapter;

impl SerializerAdapter<RawSample> for RawAdapter {
    type Error = Infallible;

    fn output_encoding() -> RepresentationIdentifier {
        RepresentationIdentifier::CDR_LE
    }

    fn to_bytes(value: &RawSample) -> Result<Bytes, Infallible> {
        Ok(value.body.clone())
    }
}

impl DeserializerAdapter<RawSample> for RawAdapter {
    type Error = Infallible;
    type Decoded = RawSample;

    fn supported_encodings() -> &'static [RepresentationIdentifier] {
        &[RepresentationIdentifier::CDR_LE]
    }

    fn transform_decoded(decoded: RawSample) -> RawSample {
        decoded
    }
}

impl DefaultDecoder<RawSample> for RawAdapter {
    type Decoder = RawDecoder;

    const DECODER: RawDecoder = RawDecoder;
}

#[derive(Debug, Clone, Copy)]
pub struct RawDecoder;

impl Decode<'_, RawSample> for RawDecoder {
    type Error = Infallible;

    fn decode_bytes(self, input_bytes: &[u8], _encoding: RepresentationIdentifier) -> Result<RawSample, Infallible> {
        Ok(RawSample {
            body: Bytes::copy_from_slice(input_bytes),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> Vec<u8> {
        let mut payload = CDR_LE_HEADER.to_vec();

        payload.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef, 0x01]);
        payload
    }

    #[test]
    fn the_writer_sends_only_the_body_under_a_cdr_le_identifier() {
        let sample = RawSample::from_payload(&payload()).expect("CDR_LE payload");
        let sent = <RawAdapter as SerializerAdapter<RawSample>>::to_bytes(&sample).expect("raw bytes");

        assert_eq!(&sent[..], &payload()[4..]);
        assert_eq!(
            <RawAdapter as SerializerAdapter<RawSample>>::output_encoding(),
            RepresentationIdentifier::CDR_LE
        );
    }

    #[test]
    fn a_received_body_comes_back_as_the_full_payload() {
        let body = &payload()[4..];
        let decoded =
            <RawAdapter as DeserializerAdapter<RawSample>>::from_bytes(body, RepresentationIdentifier::CDR_LE)
                .expect("raw bytes");

        assert_eq!(decoded.into_payload(), payload());
    }

    #[test]
    fn a_payload_without_a_cdr_le_header_is_refused() {
        assert!(RawSample::from_payload(&[0x00, 0x00, 0x00, 0x00, 0x01]).is_none());
        assert!(RawSample::from_payload(&[0x00, 0x01, 0x00]).is_none());
        assert!(RawSample::from_payload(&[0x00, 0x07, 0x00, 0x00]).is_none());
        assert_eq!(
            RawSample::from_payload(&CDR_LE_HEADER).map(RawSample::into_payload),
            Some(CDR_LE_HEADER.to_vec())
        );
    }
}
