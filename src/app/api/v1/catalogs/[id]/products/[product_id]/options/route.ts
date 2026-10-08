import { apiFailure } from "../../../../../../../../shared/errors";

export function POST(request?: Request): Response {
  return apiFailure("not_found", "没有找到。", { request });
}
