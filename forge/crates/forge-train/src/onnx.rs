use crate::mlp::Mlp;

const IR_VERSION: u64 = 8;
const OPSET: u64 = 17;
const TENSOR_FLOAT: u64 = 1;
const ATTRIBUTE_FLOAT: u64 = 1;
const NORM_CLIP: f32 = 5.0;
const ACTION_CLIP: f32 = 1.0;

pub struct Policy<'a> {
    pub actor: &'a Mlp,
    pub params: &'a [f32],
    pub mean: &'a [f32],
    pub std: &'a [f32],
}

#[derive(Default)]
struct Message {
    bytes: Vec<u8>,
}

fn varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }

    out.push(value as u8);
}

impl Message {
    fn tag(&mut self, field: u64, wire: u64) {
        varint(&mut self.bytes, (field << 3) | wire);
    }

    fn number(mut self, field: u64, value: u64) -> Self {
        self.tag(field, 0);
        varint(&mut self.bytes, value);
        self
    }

    fn bytes(mut self, field: u64, value: &[u8]) -> Self {
        self.tag(field, 2);
        varint(&mut self.bytes, value.len() as u64);
        self.bytes.extend_from_slice(value);
        self
    }

    fn text(self, field: u64, value: &str) -> Self {
        self.bytes(field, value.as_bytes())
    }

    fn message(self, field: u64, value: Message) -> Self {
        self.bytes(field, &value.bytes)
    }

    fn float(mut self, field: u64, value: f32) -> Self {
        self.tag(field, 5);
        self.bytes.extend_from_slice(&value.to_le_bytes());
        self
    }
}

fn tensor(name: &str, dims: &[usize], values: &[f32]) -> Message {
    let raw: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
    let mut message = Message::default();

    for dim in dims {
        message = message.number(1, *dim as u64);
    }

    message.number(2, TENSOR_FLOAT).text(8, name).bytes(9, &raw)
}

fn value_info(name: &str, width: usize) -> Message {
    let batch = Message::default().text(2, "batch");
    let size = Message::default().number(1, width as u64);
    let shape = Message::default().message(1, batch).message(1, size);
    let tensor_type = Message::default().number(1, TENSOR_FLOAT).message(2, shape);
    let type_proto = Message::default().message(1, tensor_type);

    Message::default().text(1, name).message(2, type_proto)
}

fn node(op: &str, name: &str, inputs: &[&str], output: &str) -> Message {
    let mut message = Message::default();

    for input in inputs {
        message = message.text(1, input);
    }

    message.text(2, output).text(3, name).text(4, op)
}

fn elu_node(name: &str, input: &str, output: &str) -> Message {
    let alpha = Message::default()
        .text(1, "alpha")
        .float(2, 1.0)
        .number(20, ATTRIBUTE_FLOAT);

    node("Elu", name, &[input], output).message(5, alpha)
}

fn weights_by_input(actor_params: &[f32], ins: usize, outs: usize) -> Vec<f32> {
    actor_params[..ins * outs].to_vec()
}

struct GraphBuilder {
    nodes: Vec<Message>,
    initializers: Vec<Message>,
}

impl GraphBuilder {
    fn normalize_input(&mut self, policy: &Policy) -> String {
        let width = policy.mean.len();

        self.initializers.push(tensor("obs_mean", &[width], policy.mean));
        self.initializers.push(tensor("obs_std", &[width], policy.std));
        self.initializers.push(tensor("clip_low", &[], &[-NORM_CLIP]));
        self.initializers.push(tensor("clip_high", &[], &[NORM_CLIP]));
        self.nodes.push(node("Sub", "center", &["obs", "obs_mean"], "centered"));
        self.nodes
            .push(node("Div", "scale", &["centered", "obs_std"], "scaled"));
        self.nodes.push(node(
            "Clip",
            "bound",
            &["scaled", "clip_low", "clip_high"],
            "normalized",
        ));

        "normalized".to_owned()
    }

    fn add_layers(&mut self, policy: &Policy, first_input: String) -> String {
        let last = policy.actor.layers.len() - 1;
        let mut current = first_input;

        for (index, layer) in policy.actor.layers.iter().enumerate() {
            let weights = format!("w{index}");
            let bias = format!("b{index}");
            let product = format!("mul{index}");
            let summed = format!("sum{index}");
            let values = weights_by_input(&policy.params[layer.weights_at..], layer.ins, layer.outs);

            self.initializers
                .push(tensor(&weights, &[layer.ins, layer.outs], &values));
            self.initializers.push(tensor(
                &bias,
                &[layer.outs],
                &policy.params[layer.bias_at..layer.bias_at + layer.outs],
            ));
            self.nodes.push(node(
                "MatMul",
                &format!("layer{index}"),
                &[&current, &weights],
                &product,
            ));
            self.nodes
                .push(node("Add", &format!("offset{index}"), &[&product, &bias], &summed));
            current = summed;

            if index < last {
                let activated = format!("elu{index}");

                self.nodes
                    .push(elu_node(&format!("activate{index}"), &current, &activated));
                current = activated;
            }
        }

        current
    }

    fn clip_output(&mut self, last: &str) {
        self.initializers.push(tensor("action_low", &[], &[-ACTION_CLIP]));
        self.initializers.push(tensor("action_high", &[], &[ACTION_CLIP]));
        self.nodes.push(node(
            "Clip",
            "bound_action",
            &[last, "action_low", "action_high"],
            "action",
        ));
    }
}

pub fn encode(policy: &Policy) -> Vec<u8> {
    let mut builder = GraphBuilder {
        nodes: Vec::new(),
        initializers: Vec::new(),
    };
    let normalized = builder.normalize_input(policy);
    let last = builder.add_layers(policy, normalized);

    builder.clip_output(&last);

    let mut graph = Message::default();

    for item in builder.nodes {
        graph = graph.message(1, item);
    }

    graph = graph.text(2, "basecase_policy");

    for item in builder.initializers {
        graph = graph.message(5, item);
    }

    graph = graph
        .message(11, value_info("obs", policy.mean.len()))
        .message(12, value_info("action", policy.actor.outs()));

    let opset = Message::default().text(1, "").number(2, OPSET);

    Message::default()
        .number(1, IR_VERSION)
        .text(2, "forge-train")
        .text(3, env!("CARGO_PKG_VERSION"))
        .message(7, graph)
        .message(8, opset)
        .bytes
}

#[cfg(test)]
mod tests {
    use super::{encode, varint, Policy};
    use crate::mlp::Mlp;

    #[test]
    fn varints_follow_protobuf() {
        let mut one = Vec::new();
        let mut large = Vec::new();

        varint(&mut one, 1);
        varint(&mut large, 300);

        assert_eq!(one, vec![1]);
        assert_eq!(large, vec![0xAC, 0x02]);
    }

    #[test]
    fn encodes_a_model_with_the_named_inputs_and_outputs() {
        let actor = Mlp::plan(&[2, 3, 1], 0);
        let params = vec![0.5f32; actor.param_end()];
        let policy = Policy {
            actor: &actor,
            params: &params,
            mean: &[0.0, 0.0],
            std: &[1.0, 1.0],
        };
        let bytes = encode(&policy);
        let contains = |needle: &[u8]| bytes.windows(needle.len()).any(|w| w == needle);

        assert!(contains(b"obs"));
        assert!(contains(b"action"));
        assert!(contains(b"Elu"));
        assert_eq!(bytes[0], 0x08);
        assert_eq!(bytes[1], 8);
    }
}
