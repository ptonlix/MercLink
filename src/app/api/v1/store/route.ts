import { getPublicStore } from "../../../../app-services/identity/profile-http";

export function GET(): Promise<Response> {
  return getPublicStore();
}
