import { readFile } from "node:fs/promises";
import path from "node:path";
import { userSkillFile } from "../../../shared/purchase-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const body = await readFile(path.join(process.cwd(), userSkillFile()), "utf8");
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
