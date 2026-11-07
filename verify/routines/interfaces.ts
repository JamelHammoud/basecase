import type { MainModule } from '@mujoco/mujoco';
import type { Plan } from '../../src/routines/planTypes';
import type { Scenario, ScenarioResult, TraceEvent } from '../../src/routines/scenarioTypes';
import type { Capability, Routine, SkillContract } from '../../src/routines/schema';
import type { RobotJoint, ScenePart } from '../../src/types/robotics';

export type FlowNodeKind =
  'base' | 'watcher' | 'reaction' | 'end' | 'do' | 'say' | 'infer' | 'ask' | 'if' | 'wait' | 'together';
export type FlowEdgeKind = 'next' | 'then' | 'else' | 'timeout' | 'fail' | 'branch' | 'trigger';

export const STEP_KINDS: readonly string[] = ['do', 'say', 'infer', 'ask', 'if', 'wait', 'together'];
export const GUARDED_KINDS: readonly string[] = ['base', 'do', 'say', 'infer', 'ask', 'wait'];

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  data: Record<string, unknown>;
}

export interface FlowEdge {
  from: string;
  to: string;
  kind: FlowEdgeKind;
}

export interface Flow {
  routine: Record<string, unknown>;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeState = 'idle' | 'active' | 'done' | 'failed' | 'timedOut' | 'cancelled' | 'then' | 'else';

export interface Lighting {
  states: Record<string, NodeState>;
  rejected: TraceEvent[];
}

export interface FlowModule {
  routineToFlow: (routine: Routine) => Flow;
  flowToRoutine: (flow: Flow) => unknown;
  lightFlow: (flow: Flow, events: TraceEvent[]) => Lighting;
}

export interface CapabilitiesModule {
  sceneCapabilities: (scene: { parts: ScenePart[]; joints: RobotJoint[] }) => Capability[];
}

export interface PhysicsRobot {
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
}

export interface RoutineKit {
  skills: SkillContract[];
  modelHash: string;
}

export interface PhysicsSample {
  t: number;
  base: [number, number, number];
  yaw: number;
  tilt: number;
  joints: Record<string, number>;
}

export interface PhysicsScenarioResult extends ScenarioResult {
  physics: { samples: PhysicsSample[]; fellAt: number | null };
}

export interface PhysicsModule {
  routineKit: (mj: MainModule, robot: PhysicsRobot) => Promise<RoutineKit>;
  runPhysicsScenario: (
    plan: Plan,
    scenario: Scenario,
    options: { mj: MainModule; robot: PhysicsRobot; kit: RoutineKit },
  ) => Promise<PhysicsScenarioResult>;
}

export const FLOW_MODULE = 'src/routines/flow';
export const CAPABILITIES_MODULE = 'src/routines/capabilities';
export const PHYSICS_MODULE = 'src/routines/physics';
