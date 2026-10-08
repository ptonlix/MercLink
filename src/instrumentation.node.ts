// Node-only startup. Keep this out of instrumentation.ts so the Edge
// instrumentation graph does not contain process.exit or other Node APIs.

export async function registerNode(): Promise<void> {
  const { boot } = await import("./shared/startup");
  await boot();
  try {
    const composition = await import("./composition/register-all");
    await composition.registerAll();
    composition.scheduleExpiryScan();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "registration failed";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
