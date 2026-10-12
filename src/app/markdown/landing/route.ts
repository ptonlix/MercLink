import { landingMarkdownResponse } from "../../../public-discovery/markdown";

export const dynamic = "force-dynamic";

export function GET(request?: Request): Promise<Response> {
  return landingMarkdownResponse(request);
}
