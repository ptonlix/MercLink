const storeSlotNames = new Set([
  "store.display_name",
  "store.summary",
  "store.logo",
  "store.website",
  "store.area",
  "store.address",
]);

const productTemplatePattern = /<template\s+data-merclink="product">([\s\S]*?)<\/template>/g;
const paidTemplatePattern = /<template\s+data-merclink="order\.paid">([\s\S]*?)<\/template>/g;

function slotPattern() {
  return /<merclink-slot\s+name="([a-z0-9._-]+)"\s*>\s*<\/merclink-slot>/g;
}

export function majorUnitPrice(minor) {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${negative ? "-" : ""}¥${String(whole)}.${String(fraction).padStart(2, "0")}`;
}

const emptyProductsTemplatePattern = /<template\s+data-merclink="products\.empty">([\s\S]*?)<\/template>/g;

export function renderPreviewDocument(html, context) {
  const hasProducts = context.products.length > 0 || context.product !== null;
  const withoutEmpty = html.replace(emptyProductsTemplatePattern, (_match, inner) => (hasProducts ? "" : inner));
  const expanded = withoutEmpty.replace(productTemplatePattern, (_match, inner) => {
    const products =
      context.products.length > 0 ? context.products : context.product === null ? [] : [context.product];
    return products.map((product) => fillProduct(inner, product)).join("");
  });
  const withProduct = context.product === null ? expanded : fillProduct(expanded, context.product);
  const withStore = withProduct.replace(slotPattern(), (match, name) => {
    if (name === "site.origin") {
      return escapeHtml(context.origin ?? "");
    }
    const value = storeSlotValue(name, context.store) ?? nextSlotValue(name, context.nextCursor);
    return value ?? match;
  });
  const withStatus = withStore.replace(slotPattern(), (match, name) => {
    if (name !== "order.status") {
      return match;
    }
    return escapeHtml(context.orderStatus ?? "");
  });
  const paid = context.orderStatus === "paid";
  return withStatus.replace(paidTemplatePattern, (_match, inner) => (paid ? inner : ""));
}

function fillProduct(html, product) {
  const expanded = expandVariantTemplates(expandFieldTemplates(html, product), product);
  const withId = expanded
    .replaceAll("{id}", escapeHtml(product.id))
    .replaceAll("{catalogId}", escapeHtml(product.catalogId ?? ""))
    .replaceAll("{priceMinor}", escapeHtml(String(product.priceMinor)))
    .replaceAll("{availabilityRaw}", escapeHtml(product.availability))
    .replaceAll("{currency}", escapeHtml(product.currency ?? "CNY"));
  return withId.replace(slotPattern(), (match, name) => productSlotValue(name, product, html) ?? match);
}

function expandFieldTemplates(html, product) {
  if (!html.includes('data-merclink="product.field"')) return html;
  return html.replace(/<template\s+data-merclink="product\.field">([\s\S]*?)<\/template>/g, (_match, inner) =>
    Object.entries(product.fields)
      .map(([key, value]) => fillNamed(inner, { "field.key": key, "field.value": fieldText(value) }))
      .join(""),
  );
}

function expandVariantTemplates(html, product) {
  if (!html.includes('data-merclink="product.variant"')) return html;
  return html.replace(/<template\s+data-merclink="product\.variant">([\s\S]*?)<\/template>/g, (_match, inner) =>
    product.variants
      .map((variant) =>
        fillNamed(inner, {
          "variant.id": variant.id ?? "",
          "variant.options": optionText(variant),
          "variant.price": slotDisplayPrice(variant.priceMinor, variant.currency ?? "CNY"),
          "variant.stock": variant.stock === null ? "" : String(variant.stock),
          "variant.availability": availabilityLabel(variant.availability),
          "variant.sku": variant.sku ?? "",
        }),
      )
      .join(""),
  );
}

function fillNamed(html, values) {
  return html.replace(slotPattern(), (match, name) => (values[name] === undefined ? match : escapeHtml(values[name])));
}

function optionText(variant) {
  const options = Object.entries(variant.optionValues).map(([key, value]) => `${key}=${value}`).join("，");
  return options.length === 0 ? "默认规格" : options;
}

function fieldText(value) {
  if (value === null) return "未填写";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function productSlotValue(name, product, html = "") {
  switch (name) {
    case "product.name":
      return escapeHtml(product.name);
    case "product.cover":
      return imageHtml(product.cover, product.name, "cover");
    case "product.fields":
      return html.includes('data-merclink="product.field"') ? "" : fieldList(product.fields);
    case "product.variants":
      return html.includes('data-merclink="product.variant"') ? "" : variantList(product.variants);
    case "product.stock":
      return product.stock === null ? "" : escapeHtml(String(product.stock));
    case "product.availability":
      return escapeHtml(availabilityLabel(product.availability));
    case "product.price":
      return escapeHtml(slotDisplayPrice(product.priceMinor, product.currency ?? "CNY"));
    default:
      return null;
  }
}

function storeSlotValue(name, store) {
  if (!storeSlotNames.has(name)) {
    return null;
  }
  if (store === null) {
    return "";
  }
  switch (name) {
    case "store.display_name":
      return escapeHtml(store.displayName);
    case "store.summary":
      return escapeHtml(store.summary);
    case "store.logo":
      return imageHtml(store.logo, store.displayName, "logo");
    case "store.website":
      return linkHtml(store.website);
    case "store.area":
      return escapeHtml(store.area ?? "");
    case "store.address":
      return escapeHtml(store.address ?? "");
    default:
      return null;
  }
}

function nextSlotValue(name, nextCursor) {
  if (name !== "products.next") {
    return null;
  }
  if (nextCursor === null || nextCursor.length === 0) {
    return "";
  }
  const href = `/products?cursor=${encodeURIComponent(nextCursor)}`;
  return `<a href="${escapeHtml(href)}">下一页商品</a>`;
}

function fieldList(fields) {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return '<p class="muted">没有公开字段。</p>';
  }
  const rows = entries.map(([key, value]) => {
    const text = value === null ? "未填写" : typeof value === "boolean" ? (value ? "是" : "否") : String(value);
    return `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(text)}</dd></div>`;
  });
  return `<dl class="facts">${rows.join("")}</dl>`;
}

function variantList(variants) {
  const items = variants.map((variant) => {
    const options = Object.entries(variant.optionValues)
      .map(([key, value]) => `${key}=${value}`)
      .join("，");
    const stock = variant.stock === null ? "不限库存" : variant.stock === 0 ? "缺货" : `库存 ${String(variant.stock)} 件`;
    const price = slotDisplayPrice(variant.priceMinor, variant.currency ?? "CNY");
    const sku =
      variant.sku === null || variant.sku === undefined || variant.sku.length === 0
        ? ""
        : `<span class="muted">SKU：${escapeHtml(variant.sku)}</span>`;
    const id = variant.id === undefined ? "" : `<span class="identifier">规格 ID：${escapeHtml(variant.id)}</span>`;
    return `<li><strong>${escapeHtml(options.length === 0 ? "默认规格" : options)}</strong><span class="price">${escapeHtml(price)}</span><span>${escapeHtml(`${stock} · ${availabilityLabel(variant.availability)}`)}</span>${sku}${id}</li>`;
  });
  return items.length === 0 ? "" : `<ul class="variants">${items.join("")}</ul>`;
}

function imageHtml(url, alt, frame = "cover") {
  if (frame === "logo" && (url === null || !isHttpUrl(url))) {
    return "";
  }
  const label = frame === "logo" ? "店铺标识" : "暂无图片";
  const image = url !== null && isHttpUrl(url) ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : "";
  const hidden = image.length > 0 ? ' aria-hidden="true"' : "";
  return `<span class="${frame}"><span class="placeholder"${hidden}>${label}</span>${image}</span>`;
}

function slotDisplayPrice(minor, currency) {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const value = `${negative ? "-" : ""}${String(whole)}.${String(fraction).padStart(2, "0")}`;
  return currency === "CNY" ? `¥${value}` : `${currency} ${value}`;
}

function availabilityLabel(value) {
  if (value === "in_stock") return "有货";
  if (value === "out_of_stock") return "缺货";
  return value;
}

function linkHtml(url) {
  if (url === null || url.length === 0) {
    return "";
  }
  if (!isHttpUrl(url)) {
    return escapeHtml(url);
  }
  const safe = escapeHtml(url);
  return `<a href="${safe}">${safe}</a>`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
