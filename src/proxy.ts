import { NextResponse, type NextRequest } from "next/server";
import { shouldRewriteToRelease } from "./app-services/storefront/serve";
import {
  htmlDiscoveryLinks,
  isServerMarkdownPath,
  markdownRewritePath,
} from "./public-discovery/negotiate";

// Reserved paths are not rewritten, so protocol routes stay on this process.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }
  const pathname = request.nextUrl.pathname;
  const markdownPath = markdownRewritePath(pathname, request.headers.get("accept"));
  if (markdownPath !== null) {
    const url = request.nextUrl.clone();
    url.pathname = markdownPath;
    return NextResponse.rewrite(url);
  }
  if (isServerMarkdownPath(pathname)) {
    return NextResponse.next();
  }
  if (!(await shouldRewriteToRelease(pathname))) {
    return withDiscoveryLinks(NextResponse.next(), pathname, request.nextUrl.search);
  }
  const url = request.nextUrl.clone();
  url.pathname = "/storefront-asset";
  const headers = new Headers(request.headers);
  headers.set("x-storefront-path", pathname);
  return NextResponse.rewrite(url, { request: { headers } });
}

function withDiscoveryLinks(
  response: NextResponse,
  pathname: string,
  search: string,
): NextResponse {
  const link = htmlDiscoveryLinks(pathname, search);
  if (link !== null) {
    response.headers.set("link", link);
  }
  return response;
}

// 不能匹配 /api。Next 在调用 proxy 前会克隆 body，默认只保留 10MB，超限不返回 413；店面上传允许 32MiB。
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
