import { postProfileImage } from "../../../../../../app-services/catalog/http";

export function POST(request: Request): Promise<Response> {
  return postProfileImage(request);
}
