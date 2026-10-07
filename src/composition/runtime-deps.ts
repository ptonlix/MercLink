export async function assertRuntimeDependencies(input: {
  redis: { ping: () => Promise<unknown> };
  objectStorage: { headBucket: () => Promise<void> };
}): Promise<void> {
  try {
    await input.redis.ping();
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "redis unavailable";
    throw new Error(`Redis is unreachable: ${detail}`);
  }
  try {
    await input.objectStorage.headBucket();
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "bucket unreachable";
    throw new Error(`Object storage bucket is unreachable: ${detail}`);
  }
}
