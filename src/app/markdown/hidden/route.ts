import { hiddenMarkdownResponse } from "../../../public-discovery/markdown";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return hiddenMarkdownResponse();
}
