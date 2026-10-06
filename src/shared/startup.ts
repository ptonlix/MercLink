import { pathToFileURL } from "node:url";
import { runMigrations } from "../db/migrate";
import { loadEnv, secretValues } from "./env";
import { redactText, startLogging } from "./log";

export async function boot(source: NodeJS.ProcessEnv = process.env): Promise<void> {
  const loaded = loadEnv(source);
  if (!loaded.ok) {
    process.stderr.write(loaded.message);
    process.exit(1);
  }

  try {
    await runMigrations({ databaseUrl: loaded.env.DATABASE_URL });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "migration failed";
    process.stderr.write(`${redactText(raw, secretValues(loaded.env))}\n`);
    process.exit(1);
  }

  startLogging();
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  void boot();
}
