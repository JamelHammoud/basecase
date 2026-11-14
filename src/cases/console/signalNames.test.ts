import { describe, expect, it } from 'vitest';
import { readPanelConfig, type PanelKind } from './panelKinds';
import { readTopicRef, signalRef, signalShape, type SignalScope } from './signalNames';

const scope: SignalScope = { declared: new Set(['clock']), probes: new Set(['dot0']), inputs: new Set(['keys']) };
const read = (kind: PanelKind, config: Record<string, unknown>) => () => readPanelConfig(kind, config, 'p', scope);
const ref =
  (shapes: Parameters<typeof signalRef>[1], many = false) =>
  (name: unknown) =>
  () =>
    signalRef(scope, shapes, many)(name, 'p');

describe('topic signal names', () => {
  it('are taken wherever numbers or labels are, without knowing the recording', () => {
    expect(signalShape('topic./imu.angular_velocity.x', scope)).toBe('topic');
    expect(ref(['number'])('topic./imu.angular_velocity.x')()).toBe('topic./imu.angular_velocity.x');
    expect(ref(['labels'])('topic./joint_states.name[2]')()).toBe('topic./joint_states.name[2]');
    expect(ref(['number'])('topic./ns/robot_1/~cmd.twist.linear.x')()).toBe('topic./ns/robot_1/~cmd.twist.linear.x');
    expect(ref(['camera'], true)('topic./camera')).toThrow(/can’t be shown here/);
    expect(ref(['number'])('topic.')).toThrow(/must be a signal name/);
    expect(ref(['number'])('topic..x')).toThrow(/must be topic.<name>/);
    expect(ref(['number'])(`topic./${'a'.repeat(234)}`)).toThrow(/must be a signal name/);
    expect(ref(['number'])(`topic./${'a'.repeat(233)}`)()).toHaveLength(240);
  });

  it('count [:] as a wildcard like *', () => {
    expect(ref(['number'])('topic./joint_states.effort[:]')).toThrow(/can’t be shown here/);
    expect(ref(['number'])('topic./imu.angular_velocity.*')).toThrow(/can’t be shown here/);
    expect(ref(['number'], true)('topic./joint_states.effort[:]')()).toBe('topic./joint_states.effort[:]');
  });

  it('keep the old rules for every other name', () => {
    expect(ref(['number'])('joint.a/b.position')).toThrow(/must be a signal name/);
    expect(ref(['number'])('joint.a[0].position')).toThrow(/must be a signal name/);
    expect(ref(['number'])(`probe.${'a'.repeat(120)}`)).toThrow(/must be a signal name/);
    expect(ref(['number'])('joint.*.position')).toThrow(/can’t be shown here/);
    expect(ref(['number'], true)('joint.*.position')()).toBe('joint.*.position');
    expect(ref(['number'])('clock')()).toBe('clock');
  });

  it('name a topic for a message, log or diagnostics panel', () => {
    expect(readTopicRef('topic./rosout', 'p')).toBe('topic./rosout');
    expect(() => readTopicRef('topic./joint_states.effort[:]', 'p')).toThrow(/must be topic.<name>/);
    expect(() => readTopicRef('topic./imu.*', 'p')).toThrow(/must be topic.<name>/);
    expect(() => readTopicRef('/rosout', 'p')).toThrow(/must be topic.<name>/);
    expect(() => readTopicRef(3, 'p')).toThrow(/must be topic.<name>/);
  });
});

describe('topic panel settings', () => {
  it('read a log', () => {
    expect(read('log', {})()).toEqual({});
    expect(read('log', { topics: ['topic./rosout'], level: 'warn' })()).toEqual({
      topics: ['topic./rosout'],
      level: 'warn',
    });
    expect(read('log', { level: 'loud' })).toThrow(/level must be one of debug, info, warn, error, fatal/);
    expect(read('log', { topics: ['topic./rosout.msg[:]'] })).toThrow(/must be topic.<name>/);
    expect(read('log', { topics: Array.from({ length: 9 }, (_, i) => `topic./log${i}`) })).toThrow(/more than 8/);
  });

  it('read diagnostics and a message', () => {
    expect(read('diagnostics', {})()).toEqual({});
    expect(read('diagnostics', { topic: 'topic./diagnostics' })()).toEqual({ topic: 'topic./diagnostics' });
    expect(read('diagnostics', { topic: 'diagnostics' })).toThrow(/must be topic.<name>/);
    expect(read('message', { topic: 'topic./imu' })()).toEqual({ topic: 'topic./imu' });
    expect(read('message', {})).toThrow(/topic must be topic.<name>/);
  });

  it('read states over one signal', () => {
    expect(read('states', { signal: 'topic./mode.data' })()).toEqual({ signal: 'topic./mode.data' });
    expect(read('states', { signal: 'joint.hip.position' })()).toEqual({ signal: 'joint.hip.position' });
    expect(read('states', { signal: 'topic./joint_states.effort[:]' })).toThrow(/can’t be shown here/);
    expect(read('states', { signal: 'camera.front' })).toThrow(/can’t be shown here/);
    expect(read('states', {})).toThrow(/must be a signal name/);
  });

  it('read a plot against an x signal', () => {
    const signals = ['topic./odom.pose.pose.position.y'];

    expect(read('plot', { signals, x: 'topic./odom.pose.pose.position.x' })()).toEqual({
      signals,
      x: 'topic./odom.pose.pose.position.x',
    });
    expect(read('plot', { signals: ['robot.x'] })()).toEqual({ signals: ['robot.x'] });
    expect(read('plot', { signals, x: 'joint.*.position' })).toThrow(/x joint.\*.position can’t be shown here/);
    expect(read('plot', { signals, x: 'topic./imu.angular_velocity.*' })).toThrow(/can’t be shown here/);
  });
});
