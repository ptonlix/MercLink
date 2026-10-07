type WindowPoint = {
  member: string;
  at: number;
};

export type WindowState = Map<string, WindowPoint[]>;

export function windowKey(policy: string, subject: string): string {
  return `rl:{${subject}}:${policy}`;
}

export function applyReserve(
  state: WindowState,
  input: {
    keys: readonly string[];
    nowMs: number;
    member: string;
    limits: readonly number[];
    windowsMs: readonly number[];
  },
): { ok: true } | { ok: false; policyIndex: number } {
  if (
    input.keys.length === 0 ||
    input.keys.length !== input.limits.length ||
    input.keys.length !== input.windowsMs.length
  ) {
    return { ok: false, policyIndex: 0 };
  }
  const prepared: WindowPoint[][] = [];
  for (let index = 0; index < input.keys.length; index += 1) {
    const key = input.keys[index];
    const limit = input.limits[index];
    const windowMs = input.windowsMs[index];
    if (
      key === undefined ||
      limit === undefined ||
      windowMs === undefined ||
      limit < 1 ||
      windowMs < 1
    ) {
      return { ok: false, policyIndex: index };
    }
    const kept = (state.get(key) ?? []).filter(
      (point) => input.nowMs - point.at >= 0 && input.nowMs - point.at < windowMs,
    );
    state.set(key, kept);
    if (kept.length >= limit) {
      return { ok: false, policyIndex: index };
    }
    prepared.push(kept);
  }
  for (let index = 0; index < input.keys.length; index += 1) {
    const key = input.keys[index];
    const kept = prepared[index];
    if (key === undefined || kept === undefined) {
      continue;
    }
    state.set(key, [...kept, { member: input.member, at: input.nowMs }]);
  }
  return { ok: true };
}

export function applyRelease(state: WindowState, keys: readonly string[], member: string): void {
  for (const key of keys) {
    const current = state.get(key);
    if (current === undefined) {
      continue;
    }
    state.set(
      key,
      current.filter((point) => point.member !== member),
    );
  }
}
