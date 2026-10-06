import { dispatchOidc } from "../../../app-services/access/dispatch";
import { getAccessProvider } from "../../../app-services/access/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  const provider = await getAccessProvider();
  return dispatchOidc(provider, request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
