import {
  getMerchantProfile,
  putMerchantProfile,
} from "../../../../../app-services/identity/profile-http";

export function GET(request: Request): Promise<Response> {
  return getMerchantProfile(request);
}

export function PUT(request: Request): Promise<Response> {
  return putMerchantProfile(request);
}
