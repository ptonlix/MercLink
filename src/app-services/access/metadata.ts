import { scopes } from "../../shared/actor";
import { authorizationIssuer } from "./provider";

export function protectedResourceMetadata(appBaseUrl: string): {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: readonly string[];
} {
  const origin = appBaseUrl.replace(/\/$/, "");
  return {
    resource: `${origin}/api/v1`,
    authorization_servers: [authorizationIssuer(origin)],
    bearer_methods_supported: ["header"],
    scopes_supported: scopes,
  };
}
