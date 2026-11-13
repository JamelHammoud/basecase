use super::cdr::{Reader, Short, Writer};

pub const GET_FSM_ID: i64 = 7001;
pub const LOCOMOTION_FSM: i64 = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub id: i64,
    pub api_id: i64,
    pub lease: i64,
    pub priority: i32,
    pub noreply: bool,
    pub parameter: String,
}

impl Request {
    pub fn get_fsm_id(id: i64) -> Self {
        Self {
            id,
            api_id: GET_FSM_ID,
            lease: 0,
            priority: 0,
            noreply: false,
            parameter: String::new(),
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        writer.i64(self.id);
        writer.i64(self.api_id);
        writer.i64(self.lease);
        writer.i32(self.priority);
        writer.bool(self.noreply);
        writer.string(&self.parameter);
        writer.bytes(&[]);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Short> {
        let mut reader = Reader::new(payload)?;
        let request = Self {
            id: reader.i64()?,
            api_id: reader.i64()?,
            lease: reader.i64()?,
            priority: reader.i32()?,
            noreply: reader.bool()?,
            parameter: reader.string()?,
        };

        reader.bytes()?;

        Ok(request)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Response {
    pub id: i64,
    pub api_id: i64,
    pub code: i32,
    pub data: String,
}

impl Response {
    pub fn encode(&self) -> Vec<u8> {
        let mut writer = Writer::new();

        writer.i64(self.id);
        writer.i64(self.api_id);
        writer.i32(self.code);
        writer.string(&self.data);
        writer.bytes(&[]);
        writer.finish()
    }

    pub fn decode(payload: &[u8]) -> Result<Self, Short> {
        let mut reader = Reader::new(payload)?;
        let response = Self {
            id: reader.i64()?,
            api_id: reader.i64()?,
            code: reader.i32()?,
            data: reader.string()?,
        };

        reader.bytes()?;

        Ok(response)
    }

    pub fn data_number(&self) -> Option<i64> {
        let after_key = self.data.split_once("\"data\"")?.1;
        let after_colon = after_key.trim_start().strip_prefix(':')?.trim_start();
        let end = after_colon
            .char_indices()
            .find(|(i, c)| !(c.is_ascii_digit() || (*i == 0 && *c == '-')))
            .map_or(after_colon.len(), |(i, _)| i);

        after_colon[..end].parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_survives_the_wire() {
        let request = Request::get_fsm_id(42);

        assert_eq!(Request::decode(&request.encode()), Ok(request));
    }

    #[test]
    fn a_response_carries_the_fsm_id_as_json() {
        let response = Response {
            id: 42,
            api_id: GET_FSM_ID,
            code: 0,
            data: r#"{"data": 200}"#.into(),
        };
        let back = Response::decode(&response.encode()).unwrap();

        assert_eq!(back, response);
        assert_eq!(back.data_number(), Some(LOCOMOTION_FSM));
    }

    #[test]
    fn data_without_a_number_reads_as_none() {
        let response = |data: &str| Response {
            id: 1,
            api_id: GET_FSM_ID,
            code: 0,
            data: data.into(),
        };

        assert_eq!(response("{}").data_number(), None);
        assert_eq!(response(r#"{"data":"x"}"#).data_number(), None);
        assert_eq!(response(r#"{"data":-1}"#).data_number(), Some(-1));
    }
}
