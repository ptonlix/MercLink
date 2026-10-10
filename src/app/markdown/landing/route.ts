import { landingMarkdownResponse } from "../../../public-discovery/markdown";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return landingMarkdownResponse();
}
