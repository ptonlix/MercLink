import { getProducts } from "../../../../app-services/catalog/http";

export function GET(request: Request): Promise<Response> {
  return getProducts(request);
}
