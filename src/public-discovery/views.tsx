/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- Public pages must navigate and show remote covers without the Next client runtime. */
import type { ReactNode } from "react";
import type { PublicProduct, PublicVariant } from "../shared/seams/public-products";
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
  merchantRegistrationNote,
  merchantSkillPath,
} from "./site";

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
    <PublicShell title={model.title} lede={model.description} showMerchantNote>
      <JsonLd value={model.jsonLd} />
      <ProductSection products={model.products} nextCursor={model.nextCursor} />
      <LinkIndex links={discoveryLinks} label="发现文件" />
    </PublicShell>
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
  showMerchantNote = false,
  children,
}: {
  title: string;
  lede: string;
  showMerchantNote?: boolean;
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
        {showMerchantNote ? <p className="note">{merchantRegistrationNote}</p> : null}
        {children}
      </div>
    </main>
  );
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
