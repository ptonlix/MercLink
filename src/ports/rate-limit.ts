export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export const imageUploadPolicies = {
  "image-upload": { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitReservation = {
  id: string;
  subject: string;
  policies: readonly string[];
};

export type RateLimitReserveResult =
  | { ok: true; reservation: RateLimitReservation }
  | { ok: false; error: "limited"; policy: string }
  | { ok: false; error: "unavailable" };

export type RateLimitReleaseResult = { ok: true } | { ok: false; error: "unavailable" };

export type RateLimitPort = {
  reserve(input: {
    subject: string;
    policies: readonly string[];
    now: Date;
  }): Promise<RateLimitReserveResult>;
  release(reservation: RateLimitReservation): Promise<RateLimitReleaseResult>;
};
