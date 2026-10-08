export type SmokeConfig = {
  baseUrl: string;
  databaseName: string;
};

export function readSmokeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmokeConfig {
  const baseUrl = env.SMOKE_BASE_URL?.trim().replace(/\/$/, "");
  if (baseUrl === undefined || baseUrl === "") {
    throw new Error("SMOKE_BASE_URL is required");
  }
  const databaseName = databaseNameFrom(env.SMOKE_DATABASE_URL ?? env.DATABASE_URL);
  if (databaseName !== "merclink_smoke") {
    throw new Error(
      `smoke database must be merclink_smoke before inserting fixture data, got ${databaseName ?? "unset"}`,
    );
  }
  return { baseUrl, databaseName };
}

function databaseNameFrom(databaseUrl: string | undefined): string | null {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    return null;
  }
  try {
    const name = new URL(databaseUrl).pathname.replace(/^\//, "");
    return name === "" ? null : name;
  } catch {
    return null;
  }
}
