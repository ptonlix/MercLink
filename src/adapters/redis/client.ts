import { createClient, type RedisClientType } from "redis";

export type AppRedisClient = RedisClientType;

let shared: AppRedisClient | undefined;

function createRedisClient(url: string): AppRedisClient {
  return createClient({ url });
}

// One client per process. SMS limits must call openRedisClient instead of createClient.
export function openRedisClient(url: string): AppRedisClient {
  shared ??= createRedisClient(url);
  return shared;
}

export async function connectRedis(client: {
  isOpen: boolean;
  connect: () => Promise<unknown>;
}): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
  }
}
