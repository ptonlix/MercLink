import { protectedResourceMetadata } from "../../../app-services/access/metadata";
import { loadEnv } from "../../../shared/env";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const loaded = loadEnv(process.env);
  const origin = loaded.ok ? loaded.env.APP_BASE_URL : new URL(request.url).origin;
  return Response.json(protectedResourceMetadata(origin));
}
