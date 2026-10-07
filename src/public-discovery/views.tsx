/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- Public pages must navigate and show remote covers without the Next client runtime. */
import type { ReactNode } from "react";
import type {
  PublicAvailability,
  PublicProduct,
  PublicVariant,
} from "../shared/seams/public-products";
import type { PublicStoreProfile } from "../shared/seams/public-store";
import {
  isHttpUrl,
  jsonLdScript,
  type LandingModel,
  type ProductListModel,
  type VisibleProductModel,
} from "./model";
import {
  apiRootPath,
  buyerSkillPath,
  emptyProductsNote,
  merchantSkillPath,
  storeExplanation,
  storeSlogan,
  viewAllProductsLabel,
} from "./site";

const shelfPageSize = 4;

const startLinks = [
  { href: "/products", label: "商品列表" },
  { href: buyerSkillPath, label: "购买 Skill" },
  { href: merchantSkillPath, label: "商家 Skill" },
  { href: apiRootPath, label: "API 根地址" },
] as const;

const discoveryLinks = [
  { href: "/llms.txt", label: "llms.txt" },
  { href: "/sitemap.xml", label: "sitemap.xml" },
] as const;

export function LandingView({ model }: { model: LandingModel }): ReactNode {
  return (
    <main className="storefront">
      <style dangerouslySetInnerHTML={{ __html: storefrontCss }} />
      <JsonLd value={model.jsonLd} />
      <div className="column stack">
        {model.store === null ? null : <StoreHeader store={model.store} />}
        <ProductShelf products={model.products} nextCursor={model.nextCursor} />
        <StoreFooter />
      </div>
      <script dangerouslySetInnerHTML={{ __html: shelfScript }} />
    </main>
  );
}

export function ProductListView({ model }: { model: ProductListModel }): ReactNode {
  return (
    <PublicShell title={model.title} lede={model.description}>
      <JsonLd value={model.jsonLd} />
      <ProductSection products={model.products} nextCursor={model.nextCursor} />
    </PublicShell>
  );
}

export function ProductView({ model }: { model: VisibleProductModel }): ReactNode {
  const product = model.product;
  return (
    <PublicShell title={model.title} lede={model.description}>
      <JsonLd value={model.jsonLd} />
      <section className="stack">
        <h2>报价</h2>
        <OfferFacts product={product} />
        <dl className="facts">
          <dt>商品 ID</dt>
          <dd>{product.id}</dd>
          <dt>目录</dt>
          <dd>{product.catalogId}</dd>
          <dt>封面</dt>
          <dd>
            <Cover cover={product.cover} title={product.title} />
          </dd>
        </dl>
        <h2>公开字段</h2>
        <FieldList fields={product.fields} />
        <h2>可售规格</h2>
        <VariantList variants={product.variants} />
      </section>
    </PublicShell>
  );
}

function PublicShell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className="sheet">
      <style dangerouslySetInnerHTML={{ __html: discoveryCss }} />
      <div className="column stack">
        <header className="stack-tight">
          <p className="mark">
            <a href="/">MercLink</a>
          </p>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
        </header>
        <LinkIndex links={startLinks} label="开始" />
        {children}
      </div>
    </main>
  );
}

function StoreHeader({ store }: { store: PublicStoreProfile }): ReactNode {
  return (
    <header className="stack">
      <h1 className="store-name">{store.displayName}</h1>
      <p className="summary">{store.summary}</p>
      {store.logoUrl !== null && isHttpUrl(store.logoUrl) ? (
        <img className="logo" src={store.logoUrl} alt={store.displayName} />
      ) : null}
      {store.areaServed !== null && store.areaServed.length > 0 ? (
        <p className="area">{store.areaServed}</p>
      ) : null}
      {store.address !== null && store.address.length > 0 ? (
        <p className="address">{store.address}</p>
      ) : null}
      {store.websiteUrl !== null && isHttpUrl(store.websiteUrl) ? (
        <p className="website">
          <a href={store.websiteUrl}>{store.websiteUrl}</a>
        </p>
      ) : null}
    </header>
  );
}

function StoreFooter(): ReactNode {
  return (
    <footer className="footer stack">
      <p className="slogan">{storeSlogan}</p>
      <p className="explanation">{storeExplanation}</p>
      <p className="mark">
        <a href="/">MercLink</a>
      </p>
      <LinkIndex links={startLinks} label="开始" />
      <LinkIndex links={discoveryLinks} label="发现文件" />
    </footer>
  );
}

function ProductShelf({
  products,
  nextCursor,
}: {
  products: readonly PublicProduct[];
  nextCursor: string | null;
}): ReactNode {
  const more = products.length > shelfPageSize || nextCursor !== null;
  return (
    <section className="stack" aria-label="已上架商品">
      <h2>已上架商品</h2>
      {products.length === 0 ? (
        <p className="empty">{emptyProductsNote}</p>
      ) : (
        <div className="shelf-wrap">
          <button type="button" data-shelf-dir="-1" aria-label="上一张">
            上一张
          </button>
          <div className="shelf" data-shelf>
            {products.map((product) => (
              <a key={product.id} className="card" data-card href={`/products/${product.id}`}>
                <CardCover cover={product.cover} title={product.title} />
                <span className="card-title">{product.title}</span>
                <span className="card-price">{yuanPrice(product.offer.price)}</span>
                <span className="card-stock">{stockLabel(product.offer.availability)}</span>
              </a>
            ))}
          </div>
          <button type="button" data-shelf-dir="1" aria-label="下一张">
            下一张
          </button>
        </div>
      )}
      {more ? (
        <p>
          <a href="/products">{viewAllProductsLabel}</a>
        </p>
      ) : null}
    </section>
  );
}

function CardCover({ cover, title }: { cover: string | null; title: string }): ReactNode {
  if (cover !== null && isHttpUrl(cover)) {
    return <img className="cover" src={cover} alt={title} />;
  }
  return <span className="cover placeholder" aria-hidden="true" />;
}

function yuanPrice(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${negative ? "-" : ""}¥${String(whole)}.${String(fraction).padStart(2, "0")}`;
}

function stockLabel(availability: PublicAvailability): string {
  return availability === "in_stock" ? "有货" : "缺货";
}

function LinkIndex({
  links,
  label,
}: {
  links: readonly { href: string; label: string }[];
  label: string;
}): ReactNode {
  return (
    <nav className="stack-tight" aria-label={label}>
      <h2>{label}</h2>
      <ul className="index">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href}>
              <span>{link.label}</span>
              <span className="path">{link.href}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ProductSection({
  products,
  nextCursor,
}: {
  products: readonly PublicProduct[];
  nextCursor: string | null;
}): ReactNode {
  return (
    <section className="stack" aria-label="已上架商品">
      <h2>已上架商品</h2>
      {products.length === 0 ? (
        <p className="empty">{emptyProductsNote}</p>
      ) : (
        <ol className="catalog">
          {products.map((product) => (
            <li key={product.id}>
              <a href={`/products/${product.id}`}>{product.title}</a>
              <OfferFacts product={product} />
            </li>
          ))}
        </ol>
      )}
      {nextCursor === null ? null : (
        <p>
          <a href={`/products?cursor=${encodeURIComponent(nextCursor)}`}>还有更多已上架商品</a>
        </p>
      )}
    </section>
  );
}

function OfferFacts({ product }: { product: PublicProduct }): ReactNode {
  return (
    <p className="offer">
      <span className="price-value">{product.offer.price}</span>
      <span className="unit">分</span>
      <span>货币 {product.offer.currency}</span>
      <span className={product.offer.availability === "in_stock" ? "tag tag-in" : "tag tag-out"}>
        {product.offer.availability}
      </span>
    </p>
  );
}

function Cover({ cover, title }: { cover: string | null; title: string }): ReactNode {
  if (cover === null) {
    return "无";
  }
  if (!isHttpUrl(cover)) {
    return cover;
  }
  return <img src={cover} alt={title} />;
}

function FieldList({ fields }: { fields: PublicProduct["fields"] }): ReactNode {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return <p>没有公开字段。</p>;
  }
  return (
    <dl className="facts">
      {entries.map(([key, value]) => (
        <FieldRow key={key} name={key} value={value} />
      ))}
    </dl>
  );
}

function FieldRow({
  name,
  value,
}: {
  name: string;
  value: string | number | boolean | null;
}): ReactNode {
  return (
    <>
      <dt>{name}</dt>
      <dd>{fieldText(value)}</dd>
    </>
  );
}

function VariantList({ variants }: { variants: readonly PublicVariant[] }): ReactNode {
  if (variants.length === 0) {
    return <p>没有可售规格。</p>;
  }
  return (
    <ul className="catalog">
      {variants.map((variant) => (
        <li key={variant.id} className="stack-tight">
          <p>规格 {variant.id}</p>
          <p>
            <span className="price-value price-value-small">{variant.price}</span>
            <span className="unit">分</span>
            <span>货币 {variant.currency}</span>
            <span className={variant.availability === "in_stock" ? "tag tag-in" : "tag tag-out"}>
              {variant.availability}
            </span>
          </p>
          <p>库存 {variant.stock === null ? "不限" : String(variant.stock)}</p>
          <p>选项 {optionText(variant.optionValues)}</p>
          <p>SKU {variant.sku ?? "无"}</p>
        </li>
      ))}
    </ul>
  );
}

function JsonLd({ value }: { value: unknown }): ReactNode {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(value) }} />
  );
}

function fieldText(value: string | number | boolean | null): string {
  if (value === null) {
    return "未填";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function optionText(optionValues: Readonly<Record<string, string>>): string {
  const parts = Object.entries(optionValues).map(([key, value]) => `${key}=${value}`);
  return parts.length === 0 ? "无" : parts.join("，");
}

const discoveryCss = `
.sheet {
  box-sizing: border-box;
  min-height: 100vh;
  margin: 0;
  padding: 4.5rem 1.5rem 5rem;
  background: #f7f6f3;
  color: #2f3437;
  font-family: "Avenir Next", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
}
.sheet *, .sheet *::before, .sheet *::after { box-sizing: border-box; }
.column { max-width: 40rem; }
.stack { display: flex; flex-direction: column; gap: 1.5rem; }
.stack-tight { display: flex; flex-direction: column; gap: 0.45rem; }
.sheet h1, .sheet h2 {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Noto Serif CJK SC", serif;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.1;
  overflow-wrap: break-word;
}
.sheet h1 { font-size: 3rem; }
.sheet h2 { font-size: 1.35rem; }
.sheet p, .sheet ul, .sheet ol, .sheet dl { margin: 0; }
.mark { margin: 0; font-size: 0.95rem; }
.lede { max-width: 36rem; font-size: 1.125rem; }
.note { max-width: 36rem; }
.sheet a { color: inherit; }
.sheet a:hover { color: #111111; }
.sheet a:focus-visible { outline: 2px solid #2f3437; outline-offset: 3px; }
.index { list-style: none; padding: 0; }
.index a {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid #eaeaea;
  text-decoration: none;
}
.path {
  color: #5c5852;
  font-family: "SF Mono", "ui-monospace", monospace;
  font-size: 0.875rem;
}
.catalog { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 1.25rem; }
.catalog > li { padding-bottom: 1.25rem; border-bottom: 1px solid #eaeaea; }
.catalog a { text-decoration: none; font-size: 1.25rem; }
.offer, .catalog li p { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.6rem 0.8rem; }
.price-value {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", serif;
  font-size: 2.75rem;
  letter-spacing: -0.04em;
  line-height: 1;
}
.price-value-small { font-size: 1.7rem; }
.unit, .tag {
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.75rem;
  line-height: 1.4;
}
.unit { background: #fbf3db; color: #956400; }
.tag-in { background: #edf3ec; color: #346538; }
.tag-out { background: #fdebec; color: #9f2f2d; }
.facts {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.35rem 1rem;
}
.facts dt { color: #5c5852; }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.empty { color: #5c5852; }
@media (max-width: 36rem) {
  .sheet { padding-top: 2.5rem; }
  .sheet h1 { font-size: 2.25rem; }
  .price-value { font-size: 2.25rem; }
  .facts { grid-template-columns: 1fr; }
  .index a { flex-direction: column; gap: 0.15rem; }
}
`;

const shelfScript = `
(() => {
  const shelf = document.querySelector("[data-shelf]");
  if (shelf === null) return;
  const card = shelf.querySelector("[data-card]");
  document.querySelectorAll("[data-shelf-dir]").forEach((button) => {
    button.addEventListener("click", () => {
      const width = card instanceof HTMLElement ? card.getBoundingClientRect().width : shelf.clientWidth;
      const gap = 12;
      const dir = Number(button.getAttribute("data-shelf-dir"));
      if (!Number.isFinite(dir) || dir === 0) return;
      shelf.scrollBy({ left: dir * (width + gap), behavior: "auto" });
    });
  });
})();
`;

const storefrontCss = `
.storefront {
  box-sizing: border-box;
  min-height: 100vh;
  margin: 0;
  padding: 3rem 1.5rem 4rem;
  background: #f6f4ee;
  color: #1d1c19;
  font-family: "Avenir Next", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
}
.storefront *, .storefront *::before, .storefront *::after { box-sizing: border-box; }
.storefront .column { max-width: 72rem; margin: 0 auto; }
.storefront .stack { display: flex; flex-direction: column; gap: 1.5rem; }
.storefront .stack-tight { display: flex; flex-direction: column; gap: 0.45rem; }
.storefront h1, .storefront .slogan {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", "Noto Serif CJK SC", serif;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.storefront h1 { font-size: 3.25rem; color: #1d1c19; }
.storefront h2 {
  margin: 0;
  font-family: "Avenir Next", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 1rem;
  font-weight: 600;
}
.storefront p, .storefront ul { margin: 0; }
.storefront a { color: inherit; }
.storefront a:focus-visible { outline: 2px solid #1d1c19; outline-offset: 3px; }
.summary, .area, .address, .website, .explanation { max-width: 40rem; }
.logo { width: 4.5rem; height: 4.5rem; object-fit: cover; border-radius: 12px; background: #ffffff; }
.shelf-wrap { display: flex; align-items: center; gap: 0.75rem; }
.shelf-wrap button {
  flex: 0 0 auto;
  border: 1px solid #1d1c19;
  background: #ffffff;
  color: #1d1c19;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font: inherit;
}
.shelf {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 0.25rem;
  min-width: 0;
  flex: 1 1 auto;
}
.card {
  flex: 0 0 78%;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem;
  background: #ffffff;
  color: #1d1c19;
  border-radius: 12px;
  text-decoration: none;
}
.cover {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #efece4;
}
.placeholder { background: #efece4; }
.card-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.8em;
  font-family: "Avenir Next", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif;
}
.card-price {
  color: #6e8b32;
  font-family: "Avenir Next", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 1.05rem;
}
.card-stock { color: #1d1c19; font-size: 0.875rem; }
.footer { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e4e0d6; }
.slogan { font-size: 1.35rem; color: #6e8b32; }
.explanation { color: #1d1c19; }
.mark { font-size: 0.95rem; }
.index { list-style: none; padding: 0; }
.index a {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid #e4e0d6;
  text-decoration: none;
}
.path {
  color: #5c5852;
  font-family: "SF Mono", "ui-monospace", monospace;
  font-size: 0.875rem;
}
.empty { color: #5c5852; }
@media (min-width: 64rem) {
  .card { flex-basis: 22%; }
}
@media (max-width: 36rem) {
  .storefront { padding-top: 2rem; }
  .storefront h1 { font-size: 2.25rem; }
  .shelf-wrap { align-items: stretch; }
  .shelf-wrap button { align-self: center; }
}
`;
