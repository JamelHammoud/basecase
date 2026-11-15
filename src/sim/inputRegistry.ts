export const BUILTIN_INPUTS = ['keys', 'code', 'camera', 'hand', 'face', 'midi', 'voice', 'phone', 'gamepad'] as const;
export const NAMED_INPUTS = ['camera', 'phone', 'midi', 'leader-arm', 'voice', 'policy', 'script'] as const;
export const STUDIO_INPUTS = ['phone', 'gamepad', 'keys'];
export const CAMERA_INPUTS = ['camera', ...STUDIO_INPUTS];

const known = new Set<string>(BUILTIN_INPUTS);

export const registerInputName = (id: string) => {
  known.add(id);
};

export const hasInputSource = (id: string) => known.has(id);
