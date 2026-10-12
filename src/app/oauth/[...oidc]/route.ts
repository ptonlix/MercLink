import { gateDeviceAuthorization } from "../../../app-services/access/device-gate";
import { dispatchOidc } from "../../../app-services/access/dispatch";
import { getAccessProvider } from "../../../app-services/access/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  const gated = await gateDeviceAuthorization(request);
  if (gated instanceof Response) {
    return gated;
  }
  const provider = await getAccessProvider();
  return dispatchOidc(provider, gated);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
