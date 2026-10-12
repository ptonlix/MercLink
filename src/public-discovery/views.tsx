/* eslint-disable @next/next/no-html-link-for-pages -- Public navigation must work without the Next client runtime. */
/* eslint-disable @next/next/no-img-element -- Profile images are served by /media/{id} and must appear without the image optimizer. */
import { createElement, type ReactNode } from "react";
import { slotHtml, type SlotContext, type SlotProduct } from "../domain/storefront/slots";
import { minorUnits } from "../shared/money";
import { currentPurchaseEnabled } from "../shared/purchase-mode";
import { BannerShelf, PublicImage, UsageGuides, VariantChooser } from "./interactions";
import { bodyExampleKind, pathExample, sectionExample } from "./interface-example";
import type { ApiField, ApiSection } from "./interface-fields";
import { interfaceContract } from "./interface-fields";
import { interfaceOperationDoc, interfaceSlug } from "./interface-docs";

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

import {
  buyerSkillPath,
  emptyProductsNote,
  interfaceDirectoryGroups,
  interfaceDirectoryLabel,
  interfaceDirectoryPath,
  merchantSkillPath,
  explanationFor,
  storefrontSkillPath,
  storeSlogan,
  unverifiedProfileNotice,
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
        <PlatformUsageGuide facts={facts} />
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
        <p>
          {currentPurchaseEnabled()
            ? "当前已上架商品列表。把感兴趣的商品交给你的 Agent，继续了解规格与购买方式。"
            : "当前已上架商品列表。把感兴趣的商品交给你的 Agent，继续了解规格。"}
        </p>
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
              purchaseEnabled={currentPurchaseEnabled()}
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
            查看用户 Skill
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
            <dl className="facts">
              {Object.entries(facts.product?.fields ?? {}).map(([key, value]) => {
                const label = facts.product?.fieldLabels?.[key];
                const heading = label !== undefined && label.length > 0 ? label : key;
                return (
                  <div key={key}>
                    <dt>{heading}</dt>
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
                );
              })}
            </dl>
          )}
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
        <RecommendedFacts facts={facts} />
      </div>
      {facts?.store?.logo ? (
        <PublicImage src={httpUrl(facts.store.logo)} title={facts.store.displayName} logo />
      ) : (
        <Slot name="store.logo" facts={facts} />
      )}
    </header>
  );
}

function RecommendedFacts({ facts }: { facts: Facts }): ReactNode {
  if (facts === null) {
    return (
      <div className="profileFacts">
        <p>
          客服电话：
          <Slot name="store.contact_phone" facts={facts} />
        </p>
        <p>
          客服说明：
          <Slot name="store.contact_label" facts={facts} />
        </p>
        <p>
          客服二维码：
          <Slot name="store.contact_qr" facts={facts} />
        </p>
        <p>
          企业名称：
          <Slot name="store.license_name" facts={facts} />
        </p>
        <p>
          统一社会信用代码：
          <Slot name="store.license_credit_code" facts={facts} />
        </p>
        <p>
          法人姓名：
          <Slot name="store.license_legal_person" facts={facts} />
        </p>
        <p>
          注册地址：
          <Slot name="store.license_address" facts={facts} />
        </p>
        <p>
          营业执照：
          <Slot name="store.license_image" facts={facts} />
        </p>
      </div>
    );
  }
  const store = facts.store;
  if (store === null) {
    return null;
  }
  const hasContact =
    store.contactPhone !== null || store.contactLabel !== null || store.contactQr !== null;
  const hasLicense =
    store.licenseName !== null ||
    store.licenseCreditCode !== null ||
    store.licenseLegalPerson !== null ||
    store.licenseAddress !== null ||
    store.licenseImage !== null;
  if (!hasContact && !hasLicense) {
    return null;
  }
  const qr = store.contactQr === null ? null : httpUrl(store.contactQr);
  const licenseImage = store.licenseImage === null ? null : httpUrl(store.licenseImage);
  return (
    <section className="profileFacts">
      {hasContact ? (
        <div>
          {store.contactPhone ? <p>客服电话：{store.contactPhone}</p> : null}
          {store.contactLabel ? <p>{store.contactLabel}</p> : null}
          {qr ? <img src={qr} alt="客服二维码" /> : null}
        </div>
      ) : null}
      {hasLicense ? (
        <div>
          {store.licenseName ? <p>{store.licenseName}</p> : null}
          {store.licenseCreditCode ? <p>统一社会信用代码：{store.licenseCreditCode}</p> : null}
          {store.licenseLegalPerson ? <p>法人姓名：{store.licenseLegalPerson}</p> : null}
          {store.licenseAddress ? <p>注册地址：{store.licenseAddress}</p> : null}
          {licenseImage ? <img src={licenseImage} alt="营业执照" /> : null}
        </div>
      ) : null}
      <p>{unverifiedProfileNotice}</p>
    </section>
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

function GuideContact({ facts }: { facts: Facts }): ReactNode {
  if (facts === null) {
    return (
      <>
        <p>
          客服电话：
          <Slot name="store.contact_phone" facts={facts} />
        </p>
        <p>
          客服二维码：
          <Slot name="store.contact_qr" facts={facts} />
        </p>
      </>
    );
  }
  const store = facts.store;
  const phone = store?.contactPhone ?? null;
  const qr = store?.contactQr == null ? null : httpUrl(store.contactQr);
  if (phone === null && qr === null) {
    return (
      <span className="infoMark" tabIndex={0} aria-describedby="missing-contact-tip">
        i
        <span className="infoTip" id="missing-contact-tip" role="tooltip">
          未发布联系方式
        </span>
      </span>
    );
  }
  return (
    <>
      {phone === null ? null : <p>客服电话：{phone}</p>}
      {qr === null ? null : <img src={qr} alt="客服二维码" />}
    </>
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

function PlatformUsageGuide({ facts }: { facts: Facts }): ReactNode {
  const purchaseEnabled = currentPurchaseEnabled();
  return (
    <section className="usage" aria-labelledby="usage-title">
      <h2 id="usage-title">如何使用 MercLink</h2>
      <p className="muted">
        {purchaseEnabled
          ? "从一份 Skill 开始，让 Agent 帮你购买或上架商品。"
          : "从一份 Skill 开始，让 Agent 帮你查找或上架商品。"}
      </p>
      <UsageGuides
        buyerTabLabel={purchaseEnabled ? "我是用户，想购买" : "我是用户，想找商品"}
        buyer={
          purchaseEnabled ? (
            <>
              <h3 className="guideHeading">用户购买</h3>
              <ol className="steps">
                <li>
                  <h4>把用户 Skill 交给 Agent</h4>
                  <p>复制文档地址给你的 Agent，告诉它按这份 Skill 使用店铺。</p>
                  <a className="skillLink" href={buyerSkillPath}>
                    查看用户 Skill
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
          ) : (
            <>
              <h3 className="guideHeading">查找商品</h3>
              <ol className="steps">
                <li>
                  <h4>把用户 Skill 交给 Agent</h4>
                  <p>复制文档地址给你的 Agent，告诉它按这份 Skill 查询店铺。</p>
                  <a className="skillLink" href={buyerSkillPath}>
                    查看用户 Skill
                  </a>
                </li>
                <li>
                  <h4>告诉 Agent 想找的商品</h4>
                  <p>
                    例如：“找一款桌灯，预算 200 元。”Agent
                    会查询已上架商品和规格，查看商品无需登录。
                  </p>
                </li>
                <li>
                  <h4>核对规格和库存</h4>
                  <p>让 Agent 打开商品页，确认规格、价格和是否有货。这些事实和公开页相同。</p>
                </li>
                <li>
                  <h4>记下商品，联系店主</h4>
                  <p>
                    记下商品后联系店主。已发布联系方式时，向店主获取联系方式，手机号和二维码都会展示。
                  </p>
                  <GuideContact facts={facts} />
                </li>
              </ol>
            </>
          )
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
        <p className="muted">{explanationFor(currentPurchaseEnabled())}</p>
      </div>
      <nav aria-label="接口与发现文件">
        <a href={interfaceDirectoryPath}>{interfaceDirectoryLabel}</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/sitemap.xml">sitemap.xml</a>
      </nav>
    </footer>
  );
}

function ApiDocsFrame({
  currentSlug,
  children,
}: {
  currentSlug?: string;
  children: ReactNode;
}): ReactNode {
  const groups = interfaceDirectoryGroups();
  return (
    <main className="page apiDocs">
      <nav className="siteNav" aria-label="站点导航">
        <a href="/" className="wordmark">
          MercLink
        </a>
        <a href="/">店铺首页</a>
        <a href="/products">商品列表</a>
        <a href="/interfaces">{interfaceDirectoryLabel}</a>
      </nav>
      <div className="apiDocsFrame">
        <nav className="apiDocsNav" aria-label="接口文档">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="groupTitle">
                {group.href === null ? group.title : <a href={group.href}>{group.title}</a>}
              </p>
              {group.routes.map((route) => {
                const doc = interfaceOperationDoc(route.method, route.path);
                const slug = interfaceSlug(route.method, route.path);
                return (
                  <a
                    key={slug}
                    href={`/interfaces/${slug}`}
                    aria-current={currentSlug === slug ? "page" : undefined}
                  >
                    <span className={`methodBadge ${doc.method}`}>{doc.method}</span>
                    <span className="navCopy">
                      <code className="navPath">{route.path}</code>
                      <span className="navLabel">{doc.summary}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
          <a
            href="/interfaces/response-shape"
            aria-current={currentSlug === "response-shape" ? "page" : undefined}
          >
            响应结构
          </a>
        </nav>
        <div className="apiDocsMain">{children}</div>
      </div>
      <StoreFooter />
    </main>
  );
}

function FieldBlock({ field, prefix }: { field: ApiField; prefix: string }): ReactNode {
  return (
    <div className="apiField" id={`${prefix}-${field.name}`}>
      <div className="apiFieldHead">
        <code>{field.name}</code>
        <span className="apiType">{field.type}</span>
        {field.required ? <span className="apiRequired">必填</span> : null}
      </div>
      <p>{field.description}</p>
      {field.options !== undefined ? (
        <p className="apiFieldMeta">
          可选值:{" "}
          {field.options.map((option) => (
            <code key={option}>{option}</code>
          ))}
        </p>
      ) : null}
      {field.range !== undefined ? (
        <p className="apiFieldMeta">
          取值范围: <code>{field.range}</code>
        </p>
      ) : null}
    </div>
  );
}

function PayloadSection({
  title,
  section,
  prefix,
  exampleTitle,
  example,
}: {
  title: string;
  section: ApiSection;
  prefix: string;
  exampleTitle: string;
  example: string | null;
}): ReactNode {
  return (
    <section>
      <h2>{title}</h2>
      <p className="contentType">{section.contentType}</p>
      {section.description.length > 0 ? <p>{section.description}</p> : null}
      {section.fields.map((item) => (
        <FieldBlock key={`${prefix}-${item.name}`} field={item} prefix={prefix} />
      ))}
      <ExampleBlock title={exampleTitle} text={example} />
    </section>
  );
}

function ExampleBlock({ title, text }: { title: string; text: string | null }): ReactNode {
  if (text === null || text.length === 0) {
    return null;
  }
  return (
    <div className="apiExample">
      <h3>{title}</h3>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function InterfaceDirectory(): ReactNode {
  const first = interfaceDirectoryGroups()[0]?.routes[0];
  if (first === undefined) {
    return null;
  }
  return <InterfaceOperationPage method={first.method} path={first.path} />;
}

export function InterfaceOperationPage({
  method,
  path,
}: {
  method: string;
  path: string;
}): ReactNode {
  const doc = interfaceOperationDoc(method, path);
  const contract = interfaceContract(method, path);
  const slug = interfaceSlug(method, path);
  return (
    <ApiDocsFrame currentSlug={slug}>
      <header className="pageHeading">
        <h1>{doc.summary}</h1>
        <p>
          <span className={`methodBadge ${doc.method}`}>{doc.method}</span>
          <code>{doc.path}</code>
        </p>
      </header>
      <table className="factsTable">
        <tbody>
          <tr>
            <th>认证</th>
            <td>{doc.auth}</td>
          </tr>
          <tr>
            <th>权限</th>
            <td>{doc.permission}</td>
          </tr>
        </tbody>
      </table>
      {contract.pathParams.length > 0 ? (
        <PayloadSection
          title="路径参数"
          prefix="path"
          exampleTitle="路径示例"
          example={pathExample(path, contract.pathParams)}
          section={{ contentType: "path", description: "", fields: contract.pathParams }}
        />
      ) : null}
      {contract.query !== null ? (
        <PayloadSection
          title="查询参数"
          prefix="query"
          exampleTitle="查询示例"
          example={sectionExample(contract.query, "query")}
          section={contract.query}
        />
      ) : null}
      {contract.body !== null ? (
        <PayloadSection
          title="请求体"
          prefix="body"
          exampleTitle="请求示例"
          example={sectionExample(contract.body, bodyExampleKind(contract.body))}
          section={contract.body}
        />
      ) : null}
      {contract.responses.map((response) => (
        <section key={response.status}>
          <h2>响应</h2>
          <p className="statusCode">{response.status}</p>
          <p className="contentType">{response.section.contentType}</p>
          <p>{response.section.description}</p>
          {response.section.fields.map((item) => (
            <FieldBlock key={`${response.status}-${item.name}`} field={item} prefix="response" />
          ))}
          <ExampleBlock title="响应示例" text={sectionExample(response.section, "json")} />
        </section>
      ))}
    </ApiDocsFrame>
  );
}

function responseShapeSection(): ApiSection {
  return {
    contentType: "application/json",
    description: "",
    fields: [
      {
        name: "code",
        type: "integer",
        required: true,
        description: "成功是 200，不是 HTTP 状态本身",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "成功时是成功，不要用它分支",
      },
      {
        name: "data",
        type: "object | null",
        required: true,
        description: "资源在这里，失败时为 null",
      },
      { name: "timestamp", type: "integer", required: true, description: "Unix 毫秒" },
      {
        name: "request_id",
        type: "string",
        required: true,
        description: "请求号，以 req_ 开头",
      },
    ],
  };
}

export function InterfaceResponseShapePage(): ReactNode {
  const shape = responseShapeSection();
  return (
    <ApiDocsFrame currentSlug="response-shape">
      <header className="pageHeading">
        <h1>响应结构</h1>
      </header>
      <section>
        <h2>响应</h2>
        <p className="statusCode">200</p>
        <p className="contentType">{shape.contentType}</p>
        <p>失败时 data 为 null，比较数字 code，创建成功时 HTTP 可以是 201，code 仍是 200</p>
        {shape.fields.map((field) => (
          <FieldBlock key={field.name} prefix="response" field={field} />
        ))}
        <ExampleBlock title="响应示例" text={sectionExample(shape, "json")} />
      </section>
    </ApiDocsFrame>
  );
}
