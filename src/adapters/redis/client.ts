import { createClient, type RedisClientType } from "redis";

export type RedisEvalClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export type RedisReadyClient = RedisEvalClient & {
  ping(): Promise<string>;
};

let clientUrl: string | undefined;
let connecting: Promise<RedisClientType> | undefined;

export function getRedisClient(url: string): Promise<RedisClientType> {
  if (connecting !== undefined) {
    return connecting.then((client) => {
      if (clientUrl !== url) {
        throw new Error("Redis client is already configured");
      }
      return client;
    });
  }
  clientUrl = url;
  const created = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: false,
    },
  });
  created.on("error", () => {
    // Failed commands reject. This listener keeps a dropped socket from crashing the process.
  });
  connecting = created.connect().then(
    () => created,
    (error: unknown) => {
      connecting = undefined;
      clientUrl = undefined;
      throw error;
    },
  );
  return connecting;
}

export async function assertRedisReady(url: string, client?: RedisReadyClient): Promise<void> {
  const redis = client ?? (await getRedisClient(url));
  const reply = await redis.ping();
  if (reply !== "PONG") {
    throw new Error("Redis is unavailable");
  }
}
