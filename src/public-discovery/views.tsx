/* eslint-disable @next/next/no-html-link-for-pages -- Public navigation must work without the Next client runtime. */
import { createElement, type ReactNode } from "react";
import { slotHtml, type SlotContext, type SlotProduct } from "../domain/storefront/slots";
import { minorUnits } from "../shared/money";
import { BannerShelf, PublicImage, UsageGuides, VariantChooser } from "./interactions";

type Facts = SlotContext | null;

function httpUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function Slot({
  name,
  product,
  facts,
}: {
  name: string;
  product?: SlotProduct;
  facts: Facts;
}): ReactNode {
  if (facts === null) {
    return createElement("merclink-slot", { name });
  }
  const html = slotHtml(name, facts, product ?? facts.product);
  if (html === null || html.length === 0) {
    return null;
  }
  if (!html.includes("<")) {
    return html;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function ProductToken({
  token,
  product,
  facts,
}: {
  token: "id" | "catalogId" | "priceMinor" | "availabilityRaw" | "currency";
  product?: SlotProduct;
  facts: Facts;
}): ReactNode {
  const current = product ?? facts?.product ?? null;
  if (facts === null || current === null) {
    return `{${token}}`;
  }
  if (token === "id") return current.id;
  if (token === "catalogId") return current.catalogId ?? "";
  if (token === "priceMinor") return String(current.priceMinor);
  if (token === "availabilityRaw") return current.availability;
  return current.currency ?? "CNY";
}
import {
  apiRootPath,
  buyerSkillPath,
  emptyProductsNote,
  merchantSkillPath,
  storeExplanation,
  storefrontSkillPath,
  storeSlogan,
  viewAllProductsLabel,
} from "./site";

export function LandingTemplate({ facts = null }: { facts?: Facts }): ReactNode {
  return (
    <main className="page">
      <div className="column">
        <StoreHeader facts={facts} />
        <section className="productSection" aria-label="已上架商品">
          <EmptyProductState facts={facts} />
          {facts !== null && facts.products.length === 0 ? (
            <h2>已上架商品</h2>
          ) : (
            <BannerShelf>
              <ProductRepeat banner facts={facts} />
            </BannerShelf>
          )}
          <div className="more">
            <a className="button" href="/products">
              {viewAllProductsLabel}
            </a>
          </div>
        </section>
        <PlatformUsageGuide />
        <StoreFooter />
      </div>
    </main>
  );
}

export function ProductListTemplate({ facts = null }: { facts?: Facts }): ReactNode {
  return (
    <PublicShell>
      <header className="pageHeading">
        <h1>已上架商品</h1>
        <p>当前已上架商品列表。把感兴趣的商品交给你的 Agent，继续了解规格与购买方式。</p>
      </header>
      <EmptyProductState facts={facts} />
      <ol className="grid">
        <ProductRepeat itemWrapper facts={facts} />
      </ol>
      <nav className="pagination" aria-label="商品分页">
        <Slot name="products.next" facts={facts} />
      </nav>
      <p className="returnLink">
        <a href="/">返回店铺首页</a>
      </p>
    </PublicShell>
  );
}

export function ProductTemplate({ facts = null }: { facts?: Facts }): ReactNode {
  return (
    <PublicShell>
      <a className="returnLink" href="/products">
        返回商品列表
      </a>
      <article className="detail">
        <header className="detailHeading">
          <h1>
            <Slot name="product.name" facts={facts} />
          </h1>
        </header>
        <div className="detailCover">
          {facts?.product ? (
            <PublicImage src={httpUrl(facts.product.cover)} title={facts.product.name} />
          ) : (
            <Slot name="product.cover" facts={facts} />
          )}
        </div>
        <div className="detailInfo">
          <p className="offer">
            <span className="mainPrice">
              <Slot name="product.price" facts={facts} />
            </span>
            <span className="status">
              <Slot name="product.availability" facts={facts} />
            </span>
          </p>
          {facts?.product ? (
            <VariantChooser
              productId={facts.product.id}
              variants={facts.product.variants.map((variant) => ({
                id: variant.id ?? "",
                price: minorUnits(variant.priceMinor),
                currency: variant.currency ?? "CNY",
                stock: variant.stock,
                availability: variant.availability === "out_of_stock" ? "out_of_stock" : "in_stock",
                optionValues: variant.optionValues,
                sku: variant.sku ?? null,
              }))}
            />
          ) : (
            <>
              <template data-merclink="product.variant">
                <li>
                  <strong>
                    <Slot name="variant.options" facts={facts} />
                  </strong>
                  <span className="price">
                    <Slot name="variant.price" facts={facts} />
                  </span>
                  <span>
                    <Slot name="variant.stock" facts={facts} />
                  </span>
                  <span className="muted">
                    <Slot name="variant.availability" facts={facts} />
                  </span>
                  <span className="identifier">
                    <Slot name="variant.id" facts={facts} />
                  </span>
                </li>
              </template>
              <p className="muted">
                <Slot name="product.stock" facts={facts} />
              </p>
            </>
          )}
          <a className="skillLink" href={buyerSkillPath}>
            查看买家 Skill
          </a>
        </div>
      </article>
      <section className="factsSection">
        <div>
          <h2>公开字段</h2>
          {facts === null ? (
            <template data-merclink="product.field">
              <div>
                <dt>
                  <Slot name="field.key" facts={facts} />
                </dt>
                <dd>
                  <Slot name="field.value" facts={facts} />
                </dd>
              </div>
            </template>
          ) : (
            Object.entries(facts.product?.fields ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  {value === null
                    ? "未填写"
                    : value === true
                      ? "是"
                      : value === false
                        ? "否"
                        : String(value)}
                </dd>
              </div>
            ))
          )}
          <h2>商品信息</h2>
          <dl className="facts">
            <dt>商品 ID</dt>
            <dd>
              <ProductToken token="id" facts={facts} />
            </dd>
            <dt>目录 ID</dt>
            <dd>
              <ProductToken token="catalogId" facts={facts} />
            </dd>
          </dl>
          <details className="structured">
            <summary>查看结构化商品信息</summary>
            <pre>
              <ProductToken token="priceMinor" facts={facts} />{" "}
              <ProductToken token="availabilityRaw" facts={facts} />{" "}
              <ProductToken token="currency" facts={facts} />
            </pre>
          </details>
        </div>
      </section>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <main className="page">
      <div className="column">
        <nav className="siteNav" aria-label="站点导航">
          <a href="/" className="wordmark">
            MercLink
          </a>
          <a href="/">店铺首页</a>
          <a href="/products">商品列表</a>
        </nav>
        {children}
        <StoreFooter />
      </div>
    </main>
  );
}

function StoreHeader({ facts }: { facts: Facts }): ReactNode {
  return (
    <header className="storeHeader">
      <div>
        <h1 className="storeName">
          <Slot name="store.display_name" facts={facts} />
        </h1>
        <p className="summary">
          <Slot name="store.summary" facts={facts} />
        </p>
        <div className="storeMeta">
          {facts === null ? (
            <>
              <p>
                <Slot name="store.area" facts={facts} />
              </p>
              <p>
                <Slot name="store.address" facts={facts} />
              </p>
              <p>
                <Slot name="store.website" facts={facts} />
              </p>
            </>
          ) : (
            <>
              {facts.store?.area ? <p>{facts.store.area}</p> : null}
              {facts.store?.address ? <p>{facts.store.address}</p> : null}
              {facts.store?.website ? <Slot name="store.website" facts={facts} /> : null}
            </>
          )}
        </div>
      </div>
      {facts?.store?.logo ? (
        <PublicImage src={httpUrl(facts.store.logo)} title={facts.store.displayName} logo />
      ) : (
        <Slot name="store.logo" facts={facts} />
      )}
    </header>
  );
}

function ProductRepeat({
  banner = false,
  details = false,
  itemWrapper = false,
  facts,
}: {
  banner?: boolean;
  details?: boolean;
  itemWrapper?: boolean;
  facts: Facts;
}): ReactNode {
  if (facts === null) {
    const card = <ProductCard banner={banner} details={details} facts={facts} />;
    return <template data-merclink="product">{itemWrapper ? <li>{card}</li> : card}</template>;
  }
  return facts.products.map((product) => {
    const card = (
      <ProductCard
        key={product.id}
        product={product}
        banner={banner}
        details={details}
        facts={facts}
      />
    );
    return itemWrapper ? <li key={product.id}>{card}</li> : card;
  });
}

function EmptyProductState({ facts }: { facts: Facts }): ReactNode {
  if (facts === null) {
    return (
      <template data-merclink="products.empty">
        <EmptyProducts />
      </template>
    );
  }
  if (facts.products.length > 0 || facts.product !== null) {
    return null;
  }
  return <EmptyProducts />;
}

function ProductCard({
  banner = false,
  details = false,
  product,
  facts,
}: {
  banner?: boolean;
  details?: boolean;
  product?: SlotProduct;
  facts: Facts;
}): ReactNode {
  return (
    <a
      className={banner ? "banner" : "card"}
      href={product ? `/products/${product.id}` : "/products/{id}"}
    >
      {product ? (
        <PublicImage src={httpUrl(product.cover)} title={product.name} />
      ) : (
        <Slot name="product.cover" facts={facts} />
      )}
      <div className="cardBody">
        <h3>
          <Slot name="product.name" product={product} facts={facts} />
        </h3>
        <span className="price">
          <Slot name="product.price" product={product} facts={facts} />
        </span>
        <span className="muted">
          <Slot name="product.availability" product={product} facts={facts} />
        </span>
        {banner ? <span className="cardLink">查看详情</span> : null}
        {details ? (
          <>
            <Slot name="product.fields" product={product} facts={facts} />
            <Slot name="product.variants" product={product} facts={facts} />
            <Slot name="product.stock" product={product} facts={facts} />
          </>
        ) : null}
      </div>
    </a>
  );
}

function EmptyProducts(): ReactNode {
  return (
    <div className="empty">
      <p>{emptyProductsNote}</p>
      <p>商品上架后会出现在这里。</p>
    </div>
  );
}

function PlatformUsageGuide(): ReactNode {
  return (
    <section className="usage" aria-labelledby="usage-title">
      <h2 id="usage-title">如何使用 MercLink</h2>
      <p className="muted">从一份 Skill 开始，让 Agent 帮你购买或上架商品。</p>
      <UsageGuides
        buyer={
          <>
            <h3 className="guideHeading">买家购买</h3>
            <ol className="steps">
              <li>
                <h4>把买家 Skill 交给 Agent</h4>
                <p>复制文档地址给你的 Agent，告诉它按这份 Skill 使用店铺。</p>
                <a className="skillLink" href={buyerSkillPath}>
                  查看买家 Skill
                </a>
              </li>
              <li>
                <h4>告诉 Agent 购买需求</h4>
                <p>例如：“找一款桌灯，预算 200 元。”Agent 会查询商品和规格，查看商品无需登录。</p>
              </li>
              <li>
                <h4>下单前登录并批准</h4>
                <p>
                  打开 Agent
                  提供的设备码地址，在自己的浏览器登录或注册买家账号，再批准授权。密码和验证码只在浏览器输入。
                </p>
              </li>
              <li>
                <h4>确认商品，完成付款</h4>
                <p>
                  确认规格与数量，在支付宝收银台付款。随后让 Agent
                  查询订单，确认已支付；打开付款链接不表示支付成功。
                </p>
              </li>
            </ol>
          </>
        }
        merchant={
          <>
            <h3 className="guideHeading">店主上架</h3>
            <ol className="steps">
              <li>
                <h4>把商家 Skill 交给 Agent</h4>
                <p>让 Agent 阅读商家 Skill，了解如何管理这家店的商品。</p>
                <a className="skillLink" href={merchantSkillPath}>
                  查看商家 Skill
                </a>
                <a className="skillLink" href={storefrontSkillPath}>
                  查看店面 Skill
                </a>
              </li>
              <li>
                <h4>店主登录并批准</h4>
                <p>
                  打开 Agent 提供的设备码地址，用店主账号登录。首次登录先修改初始密码，再批准商家
                  Agent。
                </p>
              </li>
              <li>
                <h4>提供商品资料</h4>
                <p>
                  告诉 Agent
                  商品名称、售价、库存、图片和属性。有颜色或尺码时，说明实际出售的规格组合。
                </p>
              </li>
              <li>
                <h4>检查资料，完成上架</h4>
                <p>
                  Agent
                  补齐必填字段、创建可售规格、上传封面并上架。成功后商品出现在首页和列表；资料不完整时保持下架。
                </p>
              </li>
            </ol>
          </>
        }
      />
    </section>
  );
}

export function OrderResultTemplate(): ReactNode {
  return (
    <main className="page">
      <div className="column">
        <header className="pageHeading">
          <h1>订单</h1>
          <p>
            订单状态 <Slot name="order.status" facts={null} />
          </p>
        </header>
        <template data-merclink="order.paid">
          <p>支付已完成</p>
        </template>
        <p className="muted">打开付款链接不表示支付成功。</p>
      </div>
    </main>
  );
}

function StoreFooter(): ReactNode {
  return (
    <footer className="footer">
      <div>
        <p className="slogan">{storeSlogan}</p>
        <p className="muted">{storeExplanation}</p>
      </div>
      <nav aria-label="接口与发现文件">
        <a href={apiRootPath}>API 根地址</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/sitemap.xml">sitemap.xml</a>
      </nav>
    </footer>
  );
}
