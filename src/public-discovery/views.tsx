/* eslint-disable @next/next/no-html-link-for-pages -- Public navigation must work without the Next client runtime. */
import type { ReactNode } from "react";
import type { PublicProduct } from "../shared/seams/public-products";
import type { PublicStoreProfile } from "../shared/seams/public-store";
import { BannerShelf, CopyText, PublicImage, UsageGuides, VariantChooser } from "./interactions";
import {
  isHttpUrl,
  jsonLdScript,
  type LandingModel,
  type ProductListModel,
  type VisibleProductModel,
} from "./model";
import { availabilityText, displayPrice } from "./presentation";
import {
  absoluteUrl,
  apiRootPath,
  buyerSkillPath,
  emptyProductsNote,
  merchantSkillPath,
  storeExplanation,
  storeSlogan,
  viewAllProductsLabel,
} from "./site";
import styles from "./public.module.css";

export function LandingView({ model }: { model: LandingModel }): ReactNode {
  return (
    <main className={styles.page}>
      <JsonLd value={model.jsonLd} />
      <div className={styles.column}>
        {model.store === null ? null : <StoreHeader store={model.store} />}
        <section className={styles.productSection} aria-label="已上架商品">
          {model.products.length === 0 ? (
            <>
              <h2>已上架商品</h2>
              <EmptyProducts />
            </>
          ) : (
            <BannerShelf>
              {model.products.map((product) => (
                <ProductCard key={product.id} product={product} banner />
              ))}
            </BannerShelf>
          )}
          <div className={styles.more}>
            <a className={styles.button} href="/products">
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

export function ProductListView({ model }: { model: ProductListModel }): ReactNode {
  return (
    <PublicShell>
      <JsonLd value={model.jsonLd} />
      <header className={styles.pageHeading}>
        <h1>{model.title}</h1>
        <p>{model.description}把感兴趣的商品交给你的 Agent，继续了解规格与购买方式。</p>
      </header>
      {model.products.length === 0 ? (
        <EmptyProducts />
      ) : (
        <ol className={styles.grid}>
          {model.products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ol>
      )}
      {model.nextCursor === null ? null : (
        <nav className={styles.pagination} aria-label="商品分页">
          <a
            className={styles.button}
            href={`/products?cursor=${encodeURIComponent(model.nextCursor)}`}
          >
            下一页商品
          </a>
        </nav>
      )}
      <p className={styles.returnLink}>
        <a href="/">返回店铺首页</a>
      </p>
    </PublicShell>
  );
}

export function ProductView({ model }: { model: VisibleProductModel }): ReactNode {
  const product = model.product;
  return (
    <PublicShell>
      <JsonLd value={model.jsonLd} />
      <a className={styles.returnLink} href="/products">
        返回商品列表
      </a>
      <article className={styles.detail}>
        <header className={styles.detailHeading}>
          <h1>{product.title}</h1>
        </header>
        <div className={styles.detailCover}>
          <PublicImage key={product.cover} src={safeImage(product.cover)} title={product.title} />
        </div>
        <div className={styles.detailInfo}>
          <p className={styles.offer}>
            <span className={styles.mainPrice}>
              {displayPrice(product.offer.price, product.offer.currency)}
            </span>
            <span className={styles.status}>{availabilityText(product.offer.availability)}</span>
          </p>
          <VariantChooser productId={product.id} variants={product.variants} />
          <a className={styles.skillLink} href={buyerSkillPath}>
            查看买家 Skill
          </a>
        </div>
      </article>
      <section className={styles.factsSection}>
        <div>
          <h2>公开字段</h2>
          <FieldList fields={product.fields} />
        </div>
        <div>
          <h2>商品信息</h2>
          <dl className={styles.facts}>
            <dt>商品 ID</dt>
            <dd>{product.id}</dd>
            <dt>目录 ID</dt>
            <dd>{product.catalogId}</dd>
          </dl>
          <details className={styles.structured}>
            <summary>查看结构化商品信息</summary>
            <pre>{JSON.stringify(product, null, 2)}</pre>
          </details>
        </div>
      </section>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <nav className={styles.siteNav} aria-label="站点导航">
          <a href="/" className={styles.wordmark}>
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

function StoreHeader({ store }: { store: PublicStoreProfile }): ReactNode {
  return (
    <header className={styles.storeHeader}>
      <div>
        <h1 className={styles.storeName}>{store.displayName}</h1>
        <p className={styles.summary}>{store.summary}</p>
        <div className={styles.storeMeta}>
          {store.areaServed === null || store.areaServed.length === 0 ? null : (
            <p>{store.areaServed}</p>
          )}
          {store.address === null || store.address.length === 0 ? null : <p>{store.address}</p>}
          {store.websiteUrl !== null && isHttpUrl(store.websiteUrl) ? (
            <a href={store.websiteUrl}>{store.websiteUrl}</a>
          ) : null}
        </div>
      </div>
      {store.logoUrl !== null && isHttpUrl(store.logoUrl) ? (
        <PublicImage key={store.logoUrl} src={store.logoUrl} title={store.displayName} logo />
      ) : null}
    </header>
  );
}

function ProductCard({
  product,
  banner = false,
}: {
  product: PublicProduct;
  banner?: boolean;
}): ReactNode {
  return (
    <a
      className={banner ? styles.banner : styles.card}
      href={`/products/${encodeURIComponent(product.id)}`}
    >
      <PublicImage key={product.cover} src={safeImage(product.cover)} title={product.title} />
      <div className={styles.cardBody}>
        <h3>{product.title}</h3>
        <span className={styles.price}>
          {displayPrice(product.offer.price, product.offer.currency)}
        </span>
        <span className={styles.muted}>{availabilityText(product.offer.availability)}</span>
        {banner ? <span className={styles.cardLink}>查看详情</span> : null}
      </div>
    </a>
  );
}

function safeImage(cover: string | null): string | null {
  return cover !== null && isHttpUrl(cover) ? cover : null;
}

function EmptyProducts(): ReactNode {
  return (
    <div className={styles.empty}>
      <p>{emptyProductsNote}</p>
      <p>商品上架后会出现在这里。</p>
    </div>
  );
}

function PlatformUsageGuide(): ReactNode {
  const buyerUrl = absoluteUrl(buyerSkillPath);
  const merchantUrl = absoluteUrl(merchantSkillPath);
  return (
    <section className={styles.usage} aria-labelledby="usage-title">
      <h2 id="usage-title">如何使用 MercLink</h2>
      <p className={styles.muted}>从一份 Skill 开始，让 Agent 帮你购买或上架商品。</p>
      <UsageGuides
        buyer={
          <>
            <h3 className={styles.guideHeading}>买家购买</h3>
            <ol className={styles.steps}>
              <li>
                <h4>把买家 Skill 交给 Agent</h4>
                <p>复制文档地址给你的 Agent，告诉它按这份 Skill 使用店铺。</p>
                <a className={styles.skillLink} href={buyerSkillPath}>
                  查看买家 Skill
                </a>
                <code className={styles.url}>{buyerUrl}</code>
                <CopyText text={buyerUrl} label="复制买家 Skill 地址" />
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
            <h3 className={styles.guideHeading}>店主上架</h3>
            <ol className={styles.steps}>
              <li>
                <h4>把商家 Skill 交给 Agent</h4>
                <p>让 Agent 阅读商家 Skill，了解如何管理这家店的商品。</p>
                <a className={styles.skillLink} href={merchantSkillPath}>
                  查看商家 Skill
                </a>
                <code className={styles.url}>{merchantUrl}</code>
                <CopyText text={merchantUrl} label="复制商家 Skill 地址" />
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

function StoreFooter(): ReactNode {
  return (
    <footer className={styles.footer}>
      <div>
        <p className={styles.slogan}>{storeSlogan}</p>
        <p className={styles.muted}>{storeExplanation}</p>
      </div>
      <nav aria-label="接口与发现文件">
        <a href={apiRootPath}>API 根地址</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/sitemap.xml">sitemap.xml</a>
      </nav>
    </footer>
  );
}

function FieldList({ fields }: { fields: PublicProduct["fields"] }): ReactNode {
  const entries = Object.entries(fields);
  return entries.length === 0 ? (
    <p className={styles.muted}>没有公开字段。</p>
  ) : (
    <dl className={styles.facts}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            {value === null
              ? "未填写"
              : typeof value === "boolean"
                ? value
                  ? "是"
                  : "否"
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function JsonLd({ value }: { value: unknown }): ReactNode {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(value) }} />
  );
}
