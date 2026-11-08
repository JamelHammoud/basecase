use crate::job::{Job, Task};
use forge_reward::{compile, handwritten, Program, RewardState, Schema};

pub enum Rewarder {
    Stand,
    Walk,
    Program(Box<Program>),
}

impl Rewarder {
    pub fn for_job(job: &Job) -> Result<Self, String> {
        if let Some(source) = &job.options.reward {
            let schema = Schema {
                joints: job.joints.len(),
                bodies: 0,
            };
            let program = compile(source, schema).map_err(|e| format!("The reward doesn't compile: {e}"))?;

            return Ok(Self::Program(Box::new(program)));
        }

        Ok(match job.task {
            Task::Stand => Self::Stand,
            Task::Walk => Self::Walk,
        })
    }

    pub fn reward(&self, state: &RewardState) -> f64 {
        match self {
            Self::Stand => handwritten::scaled(state, handwritten::stand(state)),
            Self::Walk => handwritten::scaled(state, handwritten::walk(state)),
            Self::Program(program) => program.evaluate(state).total,
        }
    }
}
