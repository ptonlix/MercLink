import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public merchant skill. This route only reads the repository file and never a private catalog.
export async function GET(): Promise<Response> {
  const body = await readFile(path.join(process.cwd(), "src/agent-docs/merchant-skill.md"), "utf8");
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
