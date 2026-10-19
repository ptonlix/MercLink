import { getMerchantFaqs, putMerchantFaqs } from "../../../../../app-services/identity/faq-http";

export function GET(request: Request): Promise<Response> {
  return getMerchantFaqs(request);
}

export function PUT(request: Request): Promise<Response> {
  return putMerchantFaqs(request);
}
