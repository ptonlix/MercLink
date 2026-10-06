import { getCatalogs, postCatalog } from "../../../../app-services/catalog/http";

export function GET(request: Request): Promise<Response> {
  return getCatalogs(request);
}

export function POST(request: Request): Promise<Response> {
  return postCatalog(request);
}
