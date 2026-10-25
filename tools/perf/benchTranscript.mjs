const THOUGHT =
  'The left knee sits 4 mm forward of the hip axis, so the shin shell needs to clear the thigh bracket at full flexion. ' +
  'I will check the sweep, then thicken the bracket web and move the screw bosses outward so a driver reaches them. ';

const REPLY =
  'Placed the **left shin shell** and mirrored it. Changes:\n\n' +
  '- Thigh bracket web from 3 to 4 mm\n- Screw bosses moved 6 mm outward\n- Knee clearance at 90°: 2.4 mm\n\n' +
  '| Part | Size | Mass |\n|---|---|---|\n| left-shin-shell | 80 × 90 × 200 | 61 g |\n| left-thigh-bracket | 40 × 22 × 18 | 9 g |\n\n';

const CODE = Array.from(
  { length: 60 },
  (_, i) => `translate([0, ${i * 2}, 0]) cuboid([40, 2, ${10 + (i % 7)}], rounding=0.5, edges="Z");`,
).join('\n');

function* chunks(kind, text) {
  for (let i = 0; i < text.length; i += 24)
    yield { sessionUpdate: kind, content: { type: 'text', text: text.slice(i, i + 24) } };
}

export function* transcriptUpdates() {
  for (let turn = 0; ; turn++) {
    yield* chunks('agent_thought_chunk', THOUGHT.repeat(3));

    const toolCallId = `perf-tool-${turn}`;

    yield {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: 'mcp__robotics_cad__model_part',
      status: 'in_progress',
      kind: 'other',
      rawInput: { id: `part-${turn}`, name: `Part ${turn}`, language: 'openscad', code: CODE },
      _meta: { claudeCode: { toolName: 'mcp__robotics_cad__model_part' } },
    };
    yield { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' };
    yield* chunks('agent_message_chunk', REPLY);
  }
}
