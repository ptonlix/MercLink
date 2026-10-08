import { getPublicStore } from "../../../../app-services/identity/profile-http";

export function GET(request?: Request): Promise<Response> {
  return getPublicStore(request);
}
