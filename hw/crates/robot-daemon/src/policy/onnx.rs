use super::Policy;
use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;

pub struct OnnxPolicy {
    session: Session,
    _environment: Environment,
}

impl OnnxPolicy {
    pub fn load(bytes: &[u8]) -> Result<Self, String> {
        let unreadable = |error: ort::Error| format!("The policy can't be loaded: {error}");
        let environment = ort::init().with_name("basecase-policy").build().map_err(unreadable)?;
        let session = Session::builder(&environment)
            .and_then(|mut builder| builder.commit_from_memory(bytes))
            .map_err(unreadable)?;

        Ok(Self {
            session,
            _environment: environment,
        })
    }
}

impl Policy for OnnxPolicy {
    fn act(&mut self, observation: &[f32], action: &mut Vec<f32>) -> Result<(), String> {
        let input =
            Tensor::from_array(([1usize, observation.len()], observation.to_vec())).map_err(|e| e.to_string())?;
        let outputs = self
            .session
            .run(ort::inputs![input])
            .map_err(|error| error.to_string())?;
        let (_, values) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|error| error.to_string())?;

        action.clear();
        action.extend_from_slice(values);

        Ok(())
    }
}
