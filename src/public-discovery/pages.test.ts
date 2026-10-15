import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sectionExample } from "./interface-example";
import { interfaceContract, interfaceContractsMatchRegistry } from "./interface-fields";
import { interfaceDocsMatchRegistry, interfaceOperationDoc, interfaceSlug } from "./interface-docs";
import { default as InterfacesPage } from "../app/interfaces/page";
import { default as InterfaceSlugPage } from "../app/interfaces/[slug]/page";
import { InterfaceOperationPage } from "./views";
import { generateMetadata as landingMetadata, default as HomePage } from "../app/page";
import {
  generateMetadata as productMetadata,
  default as ProductPage,
} from "../app/products/[id]/page";
import { generateMetadata as listMetadata, default as ProductsPage } from "../app/products/page";
import { apiRoutes } from "../shared/api-routes";
import { resetPurchaseModeCache } from "../shared/purchase-mode";
import { minorUnits } from "../shared/money";
import {
  publicProducts,
  resetPublicProducts,
  type PublicProduct,
} from "../shared/seams/public-products";
import {
  publicStore,
  resetPublicStore,
  type PublicStoreProfile,
} from "../shared/seams/public-store";
import { landingMarkdownResponse } from "./markdown";
import {
  emptyProductsNote,
  poweredByLabel,
  productShelfHeading,
  storeExplanation,
  storeSlogan,
  unverifiedProfileNotice,
  viewAllProductsLabel,
} from "./site";
import { serverFactJsonLd } from "./model";

const origin = "https://merclink.example";

describe("public pages", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = origin;
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
    resetPublicProducts();
    resetPublicStore();
  });

  afterEach(() => {
    resetPublicProducts();
    resetPublicStore();
    delete process.env.APP_BASE_URL;
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
  });

  it("renders the landing page without executing script", async () => {
    const product = publishedProduct();
    registerProducts([product]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const metadata = await landingMetadata();

    expect(visible).toContain(product.title);
    expect(visible).toContain("USD 2599.00");
    expect(visible).toContain("有货");
    expect(visible).toContain('href="/products"');
    expect(visible).toContain('href="/skill.md"');
    expect(visible).toContain('href="/merchant/skill.md"');
    expect(visible).toContain('href="/interfaces"');
    expect(visible).toContain("接口文档");
    expect(visible).not.toContain("接口目录");
    expect(visible).not.toContain("API 根地址");
    expect(visible).not.toContain('href="/api/v1"');
    expect(visible).toContain('href="/llms.txt"');
    expect(visible).toContain('href="/sitemap.xml"');
    expect(visible).toContain(poweredByLabel);
    expect(visible).not.toContain('class="wordmark"');
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf(storeSlogan));
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf('href="/skill.md"'));
    expect(visible).toContain(`>${productShelfHeading}<`);
    expect(visible).toContain(storeExplanation);
    expect(visible).not.toContain("查询已上架商品并下单");
    expect(visible).not.toContain("不能自助注册");
    expect(visible).not.toContain("进入这一家的店");
    expect(visible).not.toContain('href="/merchants');
    expect(metadata.title).toBe("MercLink");
    expect(visible).not.toContain("<h1>MercLink</h1>");
    expect(metadata.description).toBe(storeExplanation);
    expect(metadata.alternates?.canonical).toBe(`${origin}/`);

    const graph = landingGraph(html);
    expect(graph.find((node) => node["@type"] === "Organization")).toBeUndefined();
    expect(graph.find((node) => node["@type"] === "OnlineStore")).toBeUndefined();
    const itemList = graph.find((node) => node["@type"] === "ItemList");
    expect(itemList).toMatchObject({
      numberOfItems: 1,
      itemListElement: [
        {
          name: product.title,
          url: `${origin}/products/${product.id}`,
        },
      ],
    });
  });

  it("renders seam products and keeps the offer in minor units", async () => {
    const product = publishedProduct();
    registerProducts([product]);

    const listHtml = renderToStaticMarkup(await ProductsPage({}));
    const productHtml = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const visibleProduct = visibleHtml(productHtml);
    const metadata = await productMetadata({ params: Promise.resolve({ id: product.id }) });
    const offer = productOffer(productHtml);

    expect(visibleHtml(listHtml)).toContain(product.title);
    expect(visibleProduct).toContain(product.title);
    expect(visibleProduct).not.toContain("目录 ID");
    expect(visibleProduct).not.toContain("查看结构化商品信息");
    expect(visibleProduct).not.toContain(product.catalogId);
    expect(visibleProduct).toContain("商品信息");
    expect(visibleProduct).not.toContain("公开字段");
    expect(visibleProduct).toContain("weight_g");
    expect(visibleProduct).toContain("480");
    expect(visibleProduct).toContain("size=42");
    expect(visibleProduct).toContain('class="wordmark">MercLink');
    expect(visibleProduct).toContain(poweredByLabel);
    expect(visibleHtml(listHtml)).toContain('class="wordmark">MercLink');
    expect(visibleProduct).not.toContain("规格 ID：");
    expect(visibleProduct).not.toContain("var_sentinel");
    expect(visibleProduct).not.toContain(String(product.offer.price));
    expect(visibleProduct).toContain(product.offer.currency);
    expect(visibleProduct).not.toContain(product.offer.availability);
    expect(visibleProduct).toContain("USD 2599.00");
    expect(visibleHtml(listHtml)).toContain("USD 2599.00");
    expect(offer).toEqual({
      "@type": "Offer",
      price: "2599.00",
      priceCurrency: product.offer.currency,
      availability: "https://schema.org/InStock",
      sku: "SENTINEL-42",
    });
    expect(metadata.title).toBe(product.title);
    expect(metadata.description).toBe("哨兵短靴。USD 2599.00，有货");
    expect(metadata.description).not.toContain("分");
    expect(metadata.description).not.toContain("in_stock");
    expect(metadata).not.toHaveProperty("seoDescription");
    expect(metadata.alternates?.canonical).toBe(`${origin}/products/${product.id}`);
    expect(listMetadata).toBeTypeOf("function");
    const listMeta = await listMetadata();
    expect(listMeta.alternates?.canonical).toBe(`${origin}/products`);
    expect(visibleHtml(listHtml)).toContain(String(listMeta.description));
  });

  it("does not let a product title break out of JSON-LD", async () => {
    const product = publishedProduct();
    product.title = "哨兵</script><script>alert(1)";
    registerProducts([product]);

    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );

    expect(html).not.toContain("</script><script>");
    const offer = productOffer(html);
    expect(offer.price).toBe("2599.00");
    expect(offer.availability).toBe("https://schema.org/InStock");
  });

  it("returns a noindex 404 when the seam does not return the product", async () => {
    const hiddenPrice = 424242;
    registerProducts([publishedProduct()]);

    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_hidden" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(metadata)).not.toContain(String(hiddenPrice));
    expect(JSON.stringify(metadata)).not.toContain("in_stock");

    await expectNoindexNotFound(ProductPage({ params: Promise.resolve({ id: "prd_hidden" }) }));
  });

  it("renders an http cover as an image and omits img when the cover is empty", async () => {
    const product = publishedProduct();
    registerProducts([product]);
    const html = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    const visible = visibleHtml(html);
    expect(visible).toContain(`src="${product.cover}" alt="${product.title}"`);
    const block = jsonLdBlocks(html)[0];
    expect(isRecord(block) ? block.image : undefined).toBe(product.cover);

    const empty = publishedProduct();
    empty.id = "prd_empty_cover";
    empty.cover = null;
    registerProducts([empty]);
    const emptyHtml = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: empty.id }) }),
    );
    expect(emptyHtml).not.toContain("<img");
  });

  it("renders an empty success page when the seam is unregistered", async () => {
    resetPublicProducts();

    const home = renderToStaticMarkup(await HomePage());
    const list = renderToStaticMarkup(await ProductsPage({}));

    expect(visibleHtml(home)).toContain(storeExplanation);
    expect(visibleHtml(home)).toContain(emptyProductsNote);
    expect(visibleHtml(home)).not.toContain("查询已上架商品并下单");
    expect(visibleHtml(home)).not.toContain("不能自助注册");
    expect(visibleHtml(list)).toContain(emptyProductsNote);
    expect(home).not.toContain("/products/prd_");
    expect(list).not.toContain("/products/prd_");
    expect(landingGraph(home).find((node) => node["@type"] === "ItemList")).toMatchObject({
      numberOfItems: 0,
      itemListElement: [],
    });
    expect(landingGraph(home).find((node) => node["@type"] === "OnlineStore")).toBeUndefined();

    const metadata = await productMetadata({ params: Promise.resolve({ id: "prd_missing" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expectNoindexNotFound(ProductPage({ params: Promise.resolve({ id: "prd_missing" }) }));
  });

  it("opens with the published store and keeps secrets out of the page", async () => {
    const summary = "甲".repeat(160);
    const store = publishedStore({
      summary,
      logoUrl: "https://cdn.example/logo.png",
      areaServed: "杭州市",
      address: "西湖区某某路 88 号",
      websiteUrl: "https://shop.example",
    });
    publicStore.register({ get: () => Promise.resolve(store) });
    const product = publishedProduct();
    registerProducts([product]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const metadata = await landingMetadata();
    const onlineStore = landingGraph(html).find((node) => node["@type"] === "OnlineStore");

    expect(visible.indexOf(store.displayName)).toBeLessThan(visible.indexOf(store.summary));
    expect(visible.indexOf(store.summary)).toBeLessThan(visible.indexOf(product.title));
    expect(visible.indexOf(product.title)).toBeLessThan(visible.indexOf(storeSlogan));
    expect(visible).toMatch(/<h1[^>]*>南风商店<\/h1>/);
    expect(visible).toContain("https://cdn.example/logo.png");
    expect(visible).toContain("杭州市");
    expect(visible).toContain("西湖区某某路 88 号");
    expect(visible).toContain("https://shop.example");
    expect(visible).not.toContain("13800138000");
    expect(visible).not.toContain("secret@example.com");
    expect(visible).not.toContain("password_hash");
    expect(visible).not.toContain("不能自助注册");
    expect(visible).not.toContain("进入这一家的店");
    expect(visible).not.toContain("/merchants/");
    expect(metadata.title).toBe(store.displayName);
    expect(metadata.description).toBe(Array.from(summary).slice(0, 150).join(""));
    expect(String(metadata.description)).toHaveLength(150);
    expect(visible).toContain(summary);
    expect(metadata.alternates?.canonical).toBe(`${origin}/`);
    expect(onlineStore).toMatchObject({
      name: store.displayName,
      description: summary,
      url: `${origin}/`,
      logo: store.logoUrl,
      sameAs: store.websiteUrl,
      areaServed: store.areaServed,
      address: { "@type": "PostalAddress", streetAddress: store.address },
    });
    expect(JSON.stringify(onlineStore)).not.toContain("13800138000");
  });

  it("omits empty logo, area, address, and website", async () => {
    publicStore.register({
      get: () =>
        Promise.resolve(
          publishedStore({
            logoUrl: null,
            areaServed: null,
            address: null,
            websiteUrl: null,
          }),
        ),
    });
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const onlineStore = landingGraph(html).find((node) => node["@type"] === "OnlineStore");
    expect(visible).not.toContain('class="logo"');
    expect(visible).not.toContain('class="area"');
    expect(visible).not.toContain('class="address"');
    expect(visible).not.toContain('class="website"');
    expect(onlineStore).not.toHaveProperty("logo");
    expect(onlineStore).not.toHaveProperty("sameAs");
    expect(onlineStore).not.toHaveProperty("areaServed");
    expect(onlineStore).not.toHaveProperty("address");
    expect(onlineStore).not.toHaveProperty("telephone");
    expect(onlineStore).not.toHaveProperty("identifier");
    expect(onlineStore).not.toHaveProperty("taxID");
    expect(visible).not.toContain(unverifiedProfileNotice);
    expect(visible).not.toContain('class="profileFacts"');
  });

  it("shows published license and contact as unverified facts", async () => {
    const store = publishedStore({
      address: "西湖区某某路 88 号",
      license: {
        name: "示例企业",
        creditCode: "91310000MA1FL0000N",
        legalPerson: "例某",
        registeredAddress: "示例市注册路 1 号",
        imageUrl: "https://cdn.example/license.png",
      },
      contact: null,
    });
    publicStore.register({ get: () => Promise.resolve(store) });
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    const onlineStore = landingGraph(html).find((node) => node["@type"] === "OnlineStore");
    const markdown = await (await landingMarkdownResponse()).text();

    expect(visible).toContain("示例企业");
    expect(visible).toContain("91310000MA1FL0000N");
    expect(visible).toContain("例某");
    expect(visible).toContain("示例市注册路 1 号");
    expect(visible).toContain('class="licenseImage"');
    expect(visible).toContain("https://cdn.example/license.png");
    expect(visible).toContain(">主体</h2>");
    expect(visible).not.toContain(">联系</h2>");
    expect(visible).not.toContain(unverifiedProfileNotice);
    expect(visible).not.toContain('class="recordNotice"');
    expect(visible.indexOf("南风商店")).toBeLessThan(visible.indexOf(`>${productShelfHeading}<`));
    expect(visible.indexOf(`>${productShelfHeading}<`)).toBeLessThan(
      visible.indexOf('class="profileFacts"'),
    );
    expect(visible.indexOf('class="profileFacts"')).toBeLessThan(visible.indexOf(storeSlogan));
    expect(onlineStore).toMatchObject({
      address: { "@type": "PostalAddress", streetAddress: "西湖区某某路 88 号" },
      identifier: [
        { "@type": "PropertyValue", name: "统一社会信用代码", value: "91310000MA1FL0000N" },
        { "@type": "PropertyValue", name: "法人姓名", value: "例某" },
        { "@type": "PropertyValue", name: "注册地址", value: "示例市注册路 1 号" },
      ],
    });
    expect(onlineStore).not.toHaveProperty("telephone");
    expect(JSON.stringify(onlineStore)).not.toContain("certification");
    expect(JSON.stringify(onlineStore)).not.toContain("taxID");
    expect(JSON.stringify(onlineStore)).not.toContain("founder");
    expect(JSON.stringify(onlineStore?.address)).not.toContain("示例市注册路 1 号");
    expect(markdown).toContain("91310000MA1FL0000N");
    expect(markdown).toContain(unverifiedProfileNotice);
    expect(markdown).not.toContain("客服电话");

    publicStore.register({
      get: () =>
        Promise.resolve(
          publishedStore({
            license: null,
            contact: {
              phone: "010-00000000",
              label: "白天",
              qrUrl: "https://cdn.example/qr.png",
            },
          }),
        ),
    });
    const phoneHtml = renderToStaticMarkup(await HomePage());
    const phoneMarkdown = await (await landingMarkdownResponse()).text();
    const phoneVisible = visibleHtml(phoneHtml);
    expect(phoneVisible).toContain("010-00000000");
    expect(phoneVisible).toContain("白天");
    expect(phoneVisible).toContain('class="contactQr"');
    expect(phoneVisible.match(/class="contactQr"/g)).toHaveLength(1);
    expect(phoneVisible).toContain("https://cdn.example/qr.png");
    expect(phoneVisible).toContain(">联系</h2>");
    expect(phoneVisible).not.toContain(">主体</h2>");
    expect(phoneVisible).not.toContain(unverifiedProfileNotice);
    expect(phoneVisible.indexOf("南风商店")).toBeLessThan(
      phoneVisible.indexOf(`>${productShelfHeading}<`),
    );
    expect(phoneVisible.indexOf(`>${productShelfHeading}<`)).toBeLessThan(
      phoneVisible.indexOf('class="profileFacts"'),
    );
    expect(guidePanel(phoneVisible, "guide-panel-0")).not.toContain("010-00000000");
    expect(guidePanel(phoneVisible, "guide-panel-0")).not.toContain("https://cdn.example/qr.png");
    expect(phoneVisible).not.toContain("统一社会信用代码");
    expect(phoneMarkdown).toContain("010-00000000");
    expect(phoneMarkdown).toContain(unverifiedProfileNotice);
    expect(phoneMarkdown).not.toContain("91310000MA1FL0000N");
    const injected = serverFactJsonLd({
      declaresStore: true,
      declaresProduct: false,
      store: publishedStore({
        license: store.license,
        contact: { phone: "010-00000000", label: null, qrUrl: null },
        address: "西湖区某某路 88 号",
      }),
      products: [],
      product: null,
    });
    expect(injected).toMatchObject({
      telephone: "010-00000000",
      identifier: [
        { name: "统一社会信用代码", value: "91310000MA1FL0000N" },
        { name: "法人姓名" },
        { name: "注册地址", value: "示例市注册路 1 号" },
      ],
    });
    expect(JSON.stringify(injected)).not.toContain("taxID");
  });

  it("shows two product cards in yuan and keeps them without script", async () => {
    const boots = publishedProduct();
    boots.offer = {
      ...boots.offer,
      currency: "CNY",
      price: minorUnits(159900),
      availability: "in_stock",
    };
    const cup = publishedProduct();
    cup.id = "prd_cup";
    cup.title = "哨兵杯子";
    cup.cover = null;
    cup.offer = {
      ...cup.offer,
      currency: "CNY",
      price: minorUnits(800),
      availability: "out_of_stock",
    };
    registerProducts([boots, cup]);

    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);

    expect(visible).toContain("¥1599.00");
    expect(visible).toContain("¥8.00");
    expect(visible).toContain("有货");
    expect(visible).toContain("缺货");
    expect(visible).toContain(`href="/products/${boots.id}"`);
    expect(visible).toContain(`href="/products/${cup.id}"`);
    expect(visible).toContain("placeholder");
    expect(visible).not.toContain(">无<");
    expect(visible).toContain(viewAllProductsLabel);
    expect(html).not.toContain("linear-gradient");
    expect(html).not.toContain("autoplay");
    expect(visible.indexOf(boots.title)).toBeLessThan(visible.indexOf(storeSlogan));
  });

  it("links to the product list when the shelf has another page", async () => {
    const products = ["甲", "乙", "丙", "丁", "戊"].map((title, index) => {
      const product = publishedProduct();
      product.id = `prd_shelf_${String(index)}`;
      product.title = title;
      return product;
    });
    registerProducts(products);
    const html = renderToStaticMarkup(await HomePage());
    const visible = visibleHtml(html);
    expect(visible).toContain(viewAllProductsLabel);
    expect(visible).toContain('href="/products"');
    expect(products.every((product) => visible.includes(`href="/products/${product.id}"`))).toBe(
      true,
    );
  });

  it("drops a withdrawn store profile from the landing page", async () => {
    publicStore.register({ get: () => Promise.resolve(publishedStore()) });
    const shown = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(shown).toContain("南风商店");

    resetPublicStore();
    const html = renderToStaticMarkup(await HomePage());
    const withdrawn = visibleHtml(html);
    expect(withdrawn).not.toContain("南风商店");
    expect(withdrawn).not.toContain("可以直接交给 Agent 购买");
    expect(landingGraph(html).find((node) => node["@type"] === "OnlineStore")).toBeUndefined();
  });
  it("keeps both ordered role guides and the more link in server HTML even without products", async () => {
    const disabled = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(disabled).not.toContain("完成购买");
    expect(disabled).not.toContain("复制购买需求");
    expect(disabled).not.toContain("下单前登录并批准");
    expect(disabled).not.toContain("完成付款");
    expect(disabled).toContain("我是用户，想找商品");
    expect(disabled).toContain("查找商品");
    expect(disabled).toContain("把用户 Skill 交给 Agent");
    expect(disabled).toContain("告诉 Agent 想找的商品");
    expect(disabled).toContain("记下商品，联系店主");
    expect(disabled).toContain("记下商品后联系店主。已发布的电话和二维码在商品货架下方。");
    expect(disabled).toContain('class="infoMark"');
    expect(disabled).toContain('class="infoTip"');
    expect(disabled).toContain("未发布联系方式");
    expect(disabled).not.toContain("<p>店主还没有发布联系方式。</p>");
    expect(disabled).toContain("我是店主，想配置");
    expect(disabled).not.toContain("我是店主，想上架");
    expect(disabled).not.toContain("我是店主，想改店面");
    expect(disabled).toContain("上架商品");
    expect(disabled).toContain("修改店面");
    const disabledMerchant = guidePanel(disabled, "guide-panel-1");
    const disabledStorefront = disabledMerchant.slice(disabledMerchant.indexOf("修改店面"));
    expect(disabledStorefront).not.toContain("下单");
    expect(disabledStorefront).not.toContain("购买");
    expect(disabledStorefront).toContain("查找商品仍走用户 Skill");
    process.env.MERCLINK_PURCHASE = "1";
    resetPurchaseModeCache();
    const visible = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(visible).toContain(viewAllProductsLabel);
    expect(visible).toContain("如何使用 MercLink");
    expect(visible).toContain("把用户 Skill 交给 Agent");
    expect(visible).toContain("把商家 Skill 交给 Agent");
    expect(visible).toContain("首次登录先修改初始密码");
    expect(visible).toContain("打开付款链接不表示支付成功");
    expect(visible.indexOf(viewAllProductsLabel)).toBeLessThan(
      visible.indexOf("如何使用 MercLink"),
    );
    expect((visible.match(/<ol/g) ?? []).length).toBe(3);
    expect((visible.match(/<li>/g) ?? []).length).toBe(12);
    expect(visible).toContain('href="/skill.md"');
    expect(visible).toContain('href="/merchant/skill.md"');
    expect(visible).toContain('href="/storefront/skill.md"');
    expect(visible).toContain("我是店主，想配置");
    expect(visible).toContain("上传不等于已经上线");
    const merchant = guidePanel(visible, "guide-panel-1");
    const listing = merchant.slice(0, merchant.indexOf("修改店面"));
    const storefront = merchant.slice(merchant.indexOf("修改店面"));
    expect(listing).toContain("查看商家 Skill");
    expect(listing).not.toContain("查看店面 Skill");
    expect(storefront).toContain("查看店面 Skill");
    expect(storefront).toContain("购买仍走用户 Skill");
    expect(storefront).not.toContain("查看商家 Skill");
    expect(visible).toContain("我是用户，想购买");
    expect(visible).not.toContain("我是店主，想上架");
    expect(visible).not.toContain("我是店主，想改店面");
    expect(visible).not.toContain(`${origin}/skill.md`);
    expect(visible).not.toContain("prd_demo");
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
  });

  it("shows all variant facts without script and does not submit a display price", async () => {
    const product = publishedProduct();
    product.fields = { enabled: true, optional: null };
    const variant = product.variants[0];
    if (variant === undefined) throw new Error("Fixture requires a variant");
    product.variants = [
      { ...variant, id: "var_unlimited", stock: null, sku: "SKU-1" },
      { ...variant, id: "var_empty", stock: 0, availability: "out_of_stock" },
    ];
    registerProducts([product]);
    const visible = visibleHtml(
      renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) })),
    );
    expect(visible).not.toContain("var_unlimited");
    expect(visible).not.toContain("var_empty");
    expect(visible).toContain("不限库存");
    expect(visible).toContain("缺货");
    expect(visible).toContain("SKU-1");
    expect(visible).toContain(">是<");
    expect(visible).toContain("未填写");
    expect(visible).toContain("enabled");
    expect(visible).not.toContain('action="/api/v1/orders"');
    expect(visible).not.toContain('name="price"');
  });

  it("shows a field label to people and hides the key when the seam provides one", async () => {
    const product = publishedProduct();
    product.fields = { origin: "北海合浦", note: null };
    product.fieldLabels = { origin: "产地" };
    registerProducts([product]);
    const visible = visibleHtml(
      renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) })),
    );
    expect(visible).toContain("产地");
    expect(visible).toContain("北海合浦");
    expect(visible).not.toContain("origin");
    expect(visible).toContain("note");
    expect(visible).toContain("未填写");
  });

  it("shows an axis label to people and hides the axis key when the seam provides one", async () => {
    const product = publishedProduct();
    product.axisLabels = { size: "尺码" };
    registerProducts([product]);
    const visible = visibleHtml(
      renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) })),
    );
    expect(visible).toContain("尺码 42");
    expect(visible).not.toContain("size=42");
    expect(visible).not.toContain(">size<");
  });

  it("formats CNY minor units for people while preserving the structured offer", async () => {
    const product = publishedProduct();
    product.offer = { price: minorUnits(15900), currency: "CNY", availability: "in_stock" };
    product.currency = "CNY";
    const variant = product.variants[0];
    if (variant === undefined) throw new Error("Fixture requires a variant");
    product.variants = [{ ...variant, price: minorUnits(15900), currency: "CNY" }];
    registerProducts([product]);
    const list = visibleHtml(renderToStaticMarkup(await ProductsPage({})));
    const detail = renderToStaticMarkup(
      await ProductPage({ params: Promise.resolve({ id: product.id }) }),
    );
    expect(list).toContain("¥159.00");
    expect(visibleHtml(detail)).toContain("¥159.00");
    expect(productOffer(detail).price).toBe("159.00");
    expect(product.offer.price).toBe(15900);
  });

  it("uses the returned cursor for regular pagination", async () => {
    publicProducts.register({
      list: () => Promise.resolve({ items: [publishedProduct()], nextCursor: "cursor+/=" }),
      get: () => Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" }),
    });
    const visible = visibleHtml(renderToStaticMarkup(await ProductsPage({})));
    expect(visible).toContain('href="/products?cursor=cursor%2B%2F%3D"');
    expect(visible).toContain("下一页商品");
  });

  it("uses the published store name in the nav and credits MercLink in the footer", async () => {
    const product = publishedProduct();
    registerProducts([product]);
    publicStore.register({ get: () => Promise.resolve(publishedStore()) });
    const pages = [
      visibleHtml(renderToStaticMarkup(await ProductsPage({}))),
      visibleHtml(
        renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) })),
      ),
      visibleHtml(renderToStaticMarkup(await InterfacesPage())),
    ];
    for (const html of pages) {
      expect(html).toContain('class="wordmark">南风商店');
      expect(html).not.toContain('class="wordmark">MercLink');
      expect(html).toContain(poweredByLabel);
    }
    const home = visibleHtml(renderToStaticMarkup(await HomePage()));
    expect(home).toMatch(/<h1[^>]*>南风商店<\/h1>/);
    expect(home).not.toContain('class="wordmark"');
    expect(home).toContain(poweredByLabel);
  });

  it("lists registered paths with request and response shapes", async () => {
    expect(interfaceDocsMatchRegistry()).toEqual([]);
    expect(interfaceContractsMatchRegistry()).toEqual([]);
    const html = renderToStaticMarkup(await InterfacesPage());
    const visible = elementText(html);
    expect(html).toContain("<h2>查询参数</h2>");
    expect(html).toContain("查询已上架且有可售规格的商品");
    expect(html).not.toContain("从左侧打开一条接口");
    expect(html).not.toContain('href="/api/v1"');
    expect(html).toContain('<p class="groupTitle">独立调用</p>');
    expect(html).not.toMatch(/<a[^>]*>独立调用<\/a>/);
    expect(html).toContain('<a href="/skill.md">用户 Skill</a>');
    expect(html).toContain('<a href="/merchant/skill.md">商家 Skill</a>');
    expect(html).toContain('<a href="/storefront/skill.md">店面 Skill</a>');
    expect(html).not.toContain("不由 Skill 教调用");
    expect(html).toContain('href="/interfaces/response-shape"');
    expect(html.indexOf("独立调用")).toBeLessThan(html.indexOf("响应结构"));
    for (const route of apiRoutes) {
      expect(html).toContain(`href="/interfaces/${interfaceSlug(route.method, route.path)}"`);
      expect(visible).toContain(`>${route.path}<`);
      expect(html.replace(/\stitle="[^"]*"/g, "")).toContain(route.path);
    }

    const order = renderToStaticMarkup(
      createElement(InterfaceOperationPage, { method: "POST", path: "/api/v1/orders" }),
    );
    expect(order).toContain("<h2>请求体</h2>");
    expect(order).toContain("<h3>请求示例</h3>");
    expect(order).toContain("application/json");
    expect(order).toContain("client_order_no");
    expect(order).toContain("必填");
    expect(order).toContain("<h2>响应</h2>");
    expect(order).toContain(">认证<");
    expect(order).toContain(">权限<");
    expect(order).toContain("order:write");
  });

  it("describes a closed order read as order:read and a closed create as order:write", () => {
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
    const read = interfaceOperationDoc("GET", "/api/v1/orders/{id}");
    expect(read.permission).toContain("order:read");
    expect(read.permission).not.toContain("order:write");
    expect(read.summary).toContain("40302");
    expect(read.summary).toContain("不查询支付");
    expect(read.summary).not.toContain("不能创建订单");
    expect(read.summary).not.toContain("不扣库存");

    const write = interfaceOperationDoc("POST", "/api/v1/orders");
    expect(write.permission).toContain("order:write");
    expect(write.summary).toContain("40302");
    expect(write.summary).toContain("不能创建订单");
    expect(write.summary).toContain("不扣库存");
    expect(write.summary).not.toContain("不查询支付");

    const readPage = renderToStaticMarkup(
      createElement(InterfaceOperationPage, { method: "GET", path: "/api/v1/orders/{id}" }),
    );
    expect(readPage).toContain(read.permission);
    expect(readPage).toContain(read.summary);

    process.env.MERCLINK_PURCHASE = "1";
    resetPurchaseModeCache();
    expect(interfaceOperationDoc("GET", "/api/v1/orders/{id}").permission).toBe(
      "买家，需要 order:read，只能查询自己的订单",
    );
    delete process.env.MERCLINK_PURCHASE;
    resetPurchaseModeCache();
  });

  it("shows breaking on the field change page", () => {
    const change = renderToStaticMarkup(
      createElement(InterfaceOperationPage, {
        method: "POST",
        path: "/api/v1/catalogs/{id}/fields/changes",
      }),
    );
    expect(change).toContain("<code>breaking</code>");
    expect(fieldBlock(change, "breaking")).toContain("未确认的破坏性变更时为 true");
    const generated = sectionExample(
      interfaceContract("POST", "/api/v1/catalogs/{id}/fields/changes").responses[0]?.section ?? {
        contentType: "application/json",
        description: "",
        fields: [],
      },
      "json",
    );
    expect(generated).toContain('"breaking"');
    expect(change).toContain((generated ?? "").replaceAll('"', "&quot;"));
  });

  it("renders the catalogs request example from the field table", () => {
    const body = interfaceContract("POST", "/api/v1/catalogs").body;
    const generated = sectionExample(
      body ?? { contentType: "application/json", description: "", fields: [] },
      "json",
    );
    const html = renderToStaticMarkup(
      createElement(InterfaceOperationPage, { method: "POST", path: "/api/v1/catalogs" }),
    );
    expect(generated).toContain('"name"');
    expect(generated).toContain('"currency"');
    expect(html).toContain("<h3>请求示例</h3>");
    expect(html).toContain((generated ?? "").replaceAll('"', "&quot;"));
    expect(html).toContain("<h3>响应示例</h3>");
  });

  it("documents order product_id as optional and does not require variant_id alone", () => {
    const order = renderToStaticMarkup(
      createElement(InterfaceOperationPage, { method: "POST", path: "/api/v1/orders" }),
    );
    const variant = fieldBlock(order, "items[].variant_id");
    const product = fieldBlock(order, "items[].product_id");
    expect(product).toContain("只有一条可售规格时才可传商品 ID");
    expect(variant).not.toContain("apiRequired");
    expect(product).not.toContain("apiRequired");
    expect(fieldBlock(order, "items[].qty")).toContain("apiRequired");
    expect(order).toContain("至少填一个");
  });

  it("returns notFound for an unknown interface slug", async () => {
    await expect(
      InterfaceSlugPage({ params: Promise.resolve({ slug: "not-a-registered-operation" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

function guidePanel(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) {
    throw new Error(`missing ${id}`);
  }
  const nextPanel = html.indexOf('id="guide-panel-', start + 1);
  const footer = html.indexOf("<footer", start);
  const bounds = [nextPanel, footer].filter((index) => index >= 0);
  const end = bounds.length === 0 ? html.length : Math.min(...bounds);
  return html.slice(start, end);
}

function publishedStore(overrides: Partial<PublicStoreProfile> = {}): PublicStoreProfile {
  return {
    displayName: "南风商店",
    summary: "可以直接交给 Agent 购买。",
    websiteUrl: null,
    logoUrl: null,
    areaServed: null,
    address: null,
    license: null,
    contact: null,
    ...overrides,
  };
}

function publishedProduct(): PublicProduct {
  return {
    id: "prd_sentinel",
    catalogId: "cat_sentinel",
    title: "哨兵短靴",
    cover: "https://cdn.example/sentinel.png",
    currency: "USD",
    offer: {
      price: minorUnits(259900),
      currency: "USD",
      availability: "in_stock",
    },
    fields: { weight_g: 480, waterproof: true, note: null },
    variants: [
      {
        id: "var_sentinel",
        price: minorUnits(259900),
        currency: "USD",
        stock: 4,
        availability: "in_stock",
        optionValues: { size: "42" },
        sku: "SENTINEL-42",
      },
    ],
  };
}

function registerProducts(items: readonly PublicProduct[]): void {
  publicProducts.register({
    list: () => Promise.resolve({ items, nextCursor: null }),
    get: (id) => {
      const product = items.find((item) => item.id === id);
      if (product === undefined) {
        return Promise.resolve({ ok: false, error: "not_found", message: "没有找到。" });
      }
      return Promise.resolve({ ok: true, product });
    },
  });
}

function visibleHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
}

function elementText(html: string): string {
  return html.replace(/<([a-zA-Z0-9:-]+)(\s[^<>]*?)?>/g, "<$1>");
}

function fieldBlock(html: string, name: string): string {
  const block = html
    .split('<div class="apiField"')
    .find((item) => item.includes(`<code>${name}</code>`));
  if (block === undefined) {
    throw new Error(`missing field ${name}`);
  }
  return block;
}

function landingGraph(html: string): Record<string, unknown>[] {
  const block = jsonLdBlocks(html)[0];
  if (!isRecord(block) || !Array.isArray(block["@graph"])) {
    throw new Error("landing JSON-LD is missing @graph");
  }
  return block["@graph"].filter(isRecord);
}

function productOffer(html: string): {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  sku?: string;
} {
  const offers = productOffers(html);
  const offer = offers[0];
  if (offer === undefined) {
    throw new Error("product JSON-LD is missing Offer");
  }
  return offer;
}

function productOffers(html: string): {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
  sku?: string;
}[] {
  const block = jsonLdBlocks(html)[0];
  if (!isRecord(block) || block["@type"] !== "Product" || !Array.isArray(block.offers)) {
    throw new Error("product JSON-LD is missing Offer");
  }
  return block.offers.map((offer) => {
    if (!isRecord(offer) || offer["@type"] !== "Offer") {
      throw new Error("product JSON-LD offer type mismatch");
    }
    if (
      typeof offer.price !== "string" ||
      typeof offer.priceCurrency !== "string" ||
      typeof offer.availability !== "string"
    ) {
      throw new Error("product JSON-LD offer fields mismatch");
    }
    return {
      "@type": "Offer",
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      availability: offer.availability,
      ...(typeof offer.sku === "string" ? { sku: offer.sku } : {}),
    };
  });
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const raw = match[1];
    if (raw === undefined) {
      continue;
    }
    blocks.push(JSON.parse(raw));
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function expectNoindexNotFound(result: Promise<unknown>): Promise<void> {
  try {
    await result;
  } catch (error: unknown) {
    expect(isNoindexNotFound(error)).toBe(true);
    return;
  }
  throw new Error("expected a noindex 404");
}

function isNoindexNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("NEXT_HTTP_ERROR_FALLBACK;404") &&
    "digest" in error &&
    error.digest === "NEXT_HTTP_ERROR_FALLBACK;404"
  );
}
