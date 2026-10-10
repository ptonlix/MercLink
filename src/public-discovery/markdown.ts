import type { PublicProduct } from "../shared/seams/public-products";
import {
  loadLanding,
  loadProduct,
  loadProductList,
  type LandingModel,
  type ProductListModel,
  type VisibleProductModel,
} from "./model";
import { canonicalLink, isPublicProductId } from "./negotiate";
import { availabilityText, displayPrice, optionText, variantStock } from "./presentation";
import { emptyProductsNote } from "./site";

const hiddenProductMarkdownBody = "没有找到商品。\n";

function renderLandingMarkdown(model: LandingModel): string {
  const lines = [`# ${oneLine(model.title)}`, "", model.description, ""];
  appendStoreFacts(lines, model.store);
  lines.push("## 已上架商品", "");
  appendProducts(lines, model.products);
  return lines.join("\n");
}

function renderListMarkdown(model: ProductListModel): string {
  const lines = [`# ${model.title}`, "", model.description, ""];
  appendProducts(lines, model.products);
  if (model.nextCursor !== null) {
    lines.push(`下一页：/products.md?cursor=${encodeURIComponent(model.nextCursor)}`, "");
  }
  return lines.join("\n");
}

function renderProductMarkdown(model: VisibleProductModel): string {
  const product = model.product;
  const lines = [
    `# ${oneLine(product.title)}`,
    "",
    `${displayPrice(product.offer.price, product.offer.currency)}，${availabilityText(product.offer.availability)}`,
    "",
    `商品 ID：${product.id}`,
    `目录 ID：${product.catalogId}`,
    "",
    "## 公开字段",
    "",
  ];
  const fields = Object.entries(product.fields);
  if (fields.length === 0) {
    lines.push("没有公开字段。", "");
  } else {
    for (const [key, value] of fields) {
      const shown =
        value === null
          ? "未填写"
          : typeof value === "boolean"
            ? value
              ? "是"
              : "否"
            : String(value);
      lines.push(`- ${key}: ${shown}`);
    }
    lines.push("");
  }
  lines.push("## 可售规格", "");
  if (product.variants.length === 0) {
    lines.push("没有可售规格。", "");
  } else {
    for (const variant of product.variants) {
      const sku = variant.sku === null || variant.sku.length === 0 ? "" : `，SKU ${variant.sku}`;
      lines.push(
        `- ${optionText(variant.optionValues)}${sku}，${displayPrice(variant.price, variant.currency)}，${availabilityText(variant.availability)}，${variantStock(variant)}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function landingMarkdownResponse(): Promise<Response> {
  return markdownResponse(renderLandingMarkdown(await loadLanding()), "/");
}

export async function listMarkdownResponse(request: Request): Promise<Response> {
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const requested = cursor !== undefined && cursor.length > 0 ? cursor : undefined;
  const model = await loadProductList(requested);
  const htmlPath =
    requested === undefined ? "/products" : `/products?cursor=${encodeURIComponent(requested)}`;
  return markdownResponse(renderListMarkdown(model), htmlPath);
}

export async function productMarkdownResponse(id: string): Promise<Response> {
  if (!isPublicProductId(id)) {
    return hiddenMarkdownResponse();
  }
  const model = await loadProduct(id);
  if (model.kind === "hidden") {
    return hiddenMarkdownResponse();
  }
  return markdownResponse(renderProductMarkdown(model), `/products/${model.product.id}`);
}

export function hiddenMarkdownResponse(): Response {
  return new Response(hiddenProductMarkdownBody, {
    status: 404,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function markdownResponse(body: string, htmlPath: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      link: canonicalLink(htmlPath),
    },
  });
}

function appendStoreFacts(lines: string[], store: LandingModel["store"]): void {
  if (store === null) {
    return;
  }
  if (store.areaServed !== null && store.areaServed.length > 0) {
    lines.push(`- 区域：${store.areaServed}`);
  }
  if (store.address !== null && store.address.length > 0) {
    lines.push(`- 地址：${store.address}`);
  }
  if (store.websiteUrl !== null && store.websiteUrl.length > 0) {
    lines.push(`- 网站：${store.websiteUrl}`);
  }
  if (store.logoUrl !== null && store.logoUrl.length > 0) {
    lines.push(`- 标识：${store.logoUrl}`);
  }
  lines.push("");
}

function appendProducts(lines: string[], products: readonly PublicProduct[]): void {
  if (products.length === 0) {
    lines.push(emptyProductsNote, "");
    return;
  }
  for (const product of products) {
    lines.push(
      `- [${product.title}](/products/${product.id}): ${displayPrice(product.offer.price, product.offer.currency)}，${availabilityText(product.offer.availability)}`,
    );
  }
  lines.push("");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
