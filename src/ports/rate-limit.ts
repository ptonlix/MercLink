export type RateWindow = {
  name: string;
  limit: number;
  windowMs: number;
};

export type RateReservation = {
  subject: string;
  member: string;
  windows: readonly string[];
};

export type RateConsumeResult =
  | { ok: true; allowed: true; reservation: RateReservation }
  | { ok: true; allowed: false }
  | { ok: false; error: "unavailable" };

export type RateReleaseResult = { ok: true } | { ok: false; error: "unavailable" };

// Shared by image uploads and later SMS send limits. One Redis client serves every policy.
export type RateLimitPort = {
  consume: (input: { subject: string; windows: readonly RateWindow[] }) => Promise<RateConsumeResult>;
  release: (reservation: RateReservation) => Promise<RateReleaseResult>;
};
