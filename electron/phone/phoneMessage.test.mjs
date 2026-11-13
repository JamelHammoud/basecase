import { describe, expect, it } from 'vitest';
import { checkedPhoneMessage, deviceName, RateCap } from './phoneMessage.mjs';
import { acceptKey, CLOSE, FrameError, maskedFrame, OPCODE, readFrames, serverFrame } from './wsFrames.mjs';

const message = (overrides = {}) =>
  JSON.stringify({ tilt: [1.5, -2], pad: null, buttons: [false, true], ...overrides });

describe('checkedPhoneMessage', () => {
  it('rebuilds a valid message', () => {
    expect(checkedPhoneMessage(message())).toEqual({ tilt: [1.5, -2], pad: null, buttons: [false, true] });
    expect(checkedPhoneMessage(message({ pad: [-1, 1], tilt: [-180, 90] }))).toEqual({
      tilt: [-180, 90],
      pad: [-1, 1],
      buttons: [false, true],
    });
  });

  it.each([
    ['an extra key', message({ extra: true })],
    ['a missing key', JSON.stringify({ tilt: [0, 0], pad: null })],
    ['string numbers', message({ tilt: ['1', '2'] })],
    ['beta out of range', message({ tilt: [180.5, 0] })],
    ['gamma out of range', message({ tilt: [0, 91] })],
    ['a pad out of range', message({ pad: [0, 1.01] })],
    ['a three-number tilt', message({ tilt: [0, 0, 0] })],
    ['button numbers', message({ buttons: [0, 1] })],
    ['three buttons', message({ buttons: [true, true, true] })],
    ['a JSON array', JSON.stringify([1, 2])],
    ['null', 'null'],
    ['a proto key', '{"__proto__":{},"tilt":[0,0],"pad":null,"buttons":[false,false]}'],
    ['not JSON', '{tilt'],
  ])('refuses %s', (_name, text) => {
    expect(checkedPhoneMessage(text)).toBeNull();
  });
});

describe('RateCap', () => {
  it('allows 60 in a rolling second', () => {
    const cap = new RateCap();
    const allowed = Array.from({ length: 200 }, () => cap.allow(1000)).filter(Boolean);

    expect(allowed).toHaveLength(60);
    expect(cap.allow(1999)).toBe(false);
    expect(cap.allow(2000)).toBe(true);
  });
});

describe('deviceName', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Pixel 8'],
    ['Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv)', 'SM-S911B'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36', 'Phone'],
    ['Mozilla/5.0 (Linux; Android 14; <script>x</script>)', 'scriptxscript'],
    [`Mozilla/5.0 (Linux; Android 14; ${'A'.repeat(80)})`, 'A'.repeat(40)],
    [undefined, 'Phone'],
  ])('names %s', (ua, name) => {
    expect(deviceName(ua)).toBe(name);
  });
});

describe('wsFrames', () => {
  it('computes the RFC 6455 accept key', () => {
    expect(acceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('reads masked frames and keeps a partial one', () => {
    const whole = Buffer.concat([maskedFrame(OPCODE.text, 'hi'), maskedFrame(OPCODE.ping, 'p')]);
    const { frames, rest } = readFrames(Buffer.concat([whole, maskedFrame(OPCODE.text, 'later').subarray(0, 3)]));

    expect(frames.map((f) => [f.opcode, f.payload.toString()])).toEqual([
      [OPCODE.text, 'hi'],
      [OPCODE.ping, 'p'],
    ]);
    expect(rest).toHaveLength(3);
  });

  it.each([
    ['unmasked', serverFrame(OPCODE.text, 'hi'), CLOSE.protocol],
    ['binary', maskedFrame(OPCODE.binary, 'hi'), CLOSE.protocol],
    ['continuation', maskedFrame(0, 'hi'), CLOSE.protocol],
    ['not final', Buffer.from([0x01, 0x80, 0, 0, 0, 0]), CLOSE.protocol],
    ['reserved bits', Buffer.from([0xc1, 0x80, 0, 0, 0, 0]), CLOSE.protocol],
    ['over 512 bytes', maskedFrame(OPCODE.text, 'x'.repeat(513)), CLOSE.tooBig],
    ['a 64-bit length', maskedFrame(OPCODE.text, 'x'.repeat(70000)), CLOSE.tooBig],
    ['a long ping', maskedFrame(OPCODE.ping, 'x'.repeat(200)), CLOSE.protocol],
  ])('refuses a frame that is %s', (_name, bytes, code) => {
    expect(() => readFrames(bytes)).toThrow(FrameError);

    try {
      readFrames(bytes);
    } catch (err) {
      expect(err.code).toBe(code);
    }
  });
});
