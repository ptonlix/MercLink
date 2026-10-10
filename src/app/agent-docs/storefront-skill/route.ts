import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public storefront skill. This route only reads the repository file.
export async function GET(): Promise<Response> {
  const body = await readFile(
    path.join(process.cwd(), "src/agent-docs/storefront-skill.md"),
    "utf8",
  );
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
