import { apiRoutes } from "../shared/api-routes";

// 请求和响应字段只在 interface-fields.ts。这里不写第二份示例。
export type InterfaceOperationDoc = {
  method: string;
  path: string;
  summary: string;
  auth: string;
  permission: string;
};

const bearer =
  "请求头 Authorization: Bearer <访问令牌>，访问令牌用设备码换取，不要向用户要密码、短信验证码或 API Key";
const provider = "支付服务商验签，不是用户登录，也不使用 Authorization: Bearer";
const none = "无";
const merchantRead = "商家，需要 product:read 才能查看目录和商品";
const merchantWrite = "商家，需要 product:write 才能修改商品、图片或店铺介绍";
const fieldWrite = "商家，需要 field:write 才能新增或变更目录字段";
const orderRead = "商家，需要 order:read 才能查看本店订单或处理未履约收款，不能把订单标成已支付";
const storefrontWrite =
  "商家，需要 storefront:write 才能下载、上传或切换店面，只有 product:write 不够";
const providerOnly = "无，不供买家或商家调用";

function doc(
  method: string,
  path: string,
  summary: string,
  auth: string,
  permission: string,
): InterfaceOperationDoc {
  return { method, path, summary, auth, permission };
}

const docs: readonly InterfaceOperationDoc[] = [
  doc("GET", "/api/v1/products", "查询已上架且有可售规格的商品", "不需要登录", none),
  doc(
    "GET",
    "/api/v1/products/{id}",
    "读取一个已上架商品的公开字段和可售规格，下架、删除或没有可售规格时返回 404",
    "不需要登录",
    none,
  ),
  doc(
    "GET",
    "/api/v1/catalogs/{id}/schema",
    "读取目录当前字段定义，不能用来修改字段",
    "不需要登录，如果带了访问令牌但令牌无效，请求会被拒绝",
    none,
  ),
  doc(
    "POST",
    "/api/v1/orders",
    "创建一笔只有一行的订单并返回支付动作，价格由服务端计算，调用方不能传价格",
    bearer,
    "买家，需要 order:write 才能下单",
  ),
  doc(
    "GET",
    "/api/v1/orders/{id}",
    "查询自己的订单，只有 status 为 paid 才表示支付成功",
    bearer,
    "买家，需要 order:read，只能查询自己的订单",
  ),
  doc("GET", "/api/v1/catalogs", "列出自己的目录", bearer, merchantRead),
  doc(
    "POST",
    "/api/v1/catalogs",
    "新建目录，名称 1 到 80 个字符，货币默认 CNY",
    bearer,
    merchantWrite,
  ),
  doc("GET", "/api/v1/catalogs/{id}/fields", "列出目录字段，包含停用状态", bearer, merchantRead),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/fields",
    "新增字段，必填字段未确认时只返回预览，不会写入",
    bearer,
    fieldWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/fields/changes",
    "变更已有字段，破坏性操作未确认时只返回预览",
    bearer,
    fieldWrite,
  ),
  doc(
    "GET",
    "/api/v1/catalogs/{id}/products",
    "列出本目录商品，包含草稿，默认不含已软删除",
    bearer,
    merchantRead,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products",
    "新建下架商品，没有规格差异时写入 price 和 stock，系统会创建一条默认可售规格",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/images",
    "上传商品或规格封面，不能用来上传执照或客服二维码",
    bearer,
    merchantWrite,
  ),
  doc(
    "PATCH",
    "/api/v1/catalogs/{id}/products/{product_id}",
    "只改标题、封面和 fields，fields 会整份替换，不能改价格",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products/{product_id}/publish",
    "上架，缺少必填字段或没有可售规格时保持下架",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products/{product_id}/unpublish",
    "下架，商品仍留在商家列表，公开查询不再返回",
    bearer,
    merchantWrite,
  ),
  doc(
    "DELETE",
    "/api/v1/catalogs/{id}/products/{product_id}",
    "软删除商品，不会物理删除",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products/{product_id}/restore",
    "恢复已软删除的商品，商品仍是下架，规格不会自动可售",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products/{product_id}/axes",
    "声明一条规格轴，已经有规格组合后不能再加轴",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/catalogs/{id}/products/{product_id}/variants",
    "新增一个实际出售的组合，不会自动生成全部组合",
    bearer,
    merchantWrite,
  ),
  doc(
    "PATCH",
    "/api/v1/catalogs/{id}/variants/{variant_id}",
    "修改规格价格、库存、SKU、封面或状态，恢复和开售要分开请求",
    bearer,
    merchantWrite,
  ),
  doc("DELETE", "/api/v1/catalogs/{id}/variants/{variant_id}", "软删除规格", bearer, merchantWrite),
  doc(
    "GET",
    "/api/v1/manage/orders",
    "读取订单行属于自己目录的订单，不能把订单标成已支付",
    bearer,
    orderRead,
  ),
  doc(
    "POST",
    "/api/v1/manage/payments/{paymentId}/unapplied-receipt",
    "处理自己的 open 或 refund_failed 收款，不会把订单改成 paid，也不会改库存",
    bearer,
    orderRead,
  ),
  doc(
    "GET",
    "/api/v1/merchant/profile",
    "读取自己的介绍草稿，还没保存时返回空草稿，不是 404",
    bearer,
    "必须是商家，读取自己的介绍不需要额外权限名",
  ),
  doc(
    "PUT",
    "/api/v1/merchant/profile",
    "整份替换店铺介绍，九个字段必须同时出现",
    bearer,
    merchantWrite,
  ),
  doc(
    "POST",
    "/api/v1/merchant/profile/images",
    "上传执照或客服二维码，不会因此发布介绍",
    bearer,
    merchantWrite,
  ),
  doc("GET", "/api/v1/store", "读取已发布介绍，未发布时返回 404，不回显草稿", "不需要登录", none),
  doc(
    "POST",
    "/api/v1/payments/alipay/notify",
    "支付宝异步通知，先验签，验签失败不改订单状态",
    provider,
    providerOnly,
  ),
  doc(
    "GET",
    "/api/v1/payments/easypay/notify",
    "易支付通知，先验签，只有 TRADE_SUCCESS 且金额一致才记账",
    provider,
    providerOnly,
  ),
  doc(
    "POST",
    "/api/v1/payments/easypay/notify",
    "易支付通知，规则与 GET 相同",
    provider,
    providerOnly,
  ),
  doc(
    "GET",
    "/.well-known/oauth-protected-resource",
    "受保护资源元数据，没有令牌时 401 的 WWW-Authenticate 指向这里",
    "不需要登录",
    none,
  ),
  doc("GET", "/api/v1/storefront/source", "下载当前店面源码包", bearer, storefrontWrite),
  doc(
    "POST",
    "/api/v1/storefront/releases",
    "上传源码包和静态包，上传成功不会切换线上页面",
    bearer,
    storefrontWrite,
  ),
  doc(
    "POST",
    "/api/v1/storefront/releases/{id}/activate",
    "确认激活店面，未确认不会改线上指针",
    bearer,
    storefrontWrite,
  ),
  doc(
    "POST",
    "/api/v1/storefront/rollback",
    "把线上指针退回上一份发布，没有上一份时回到内置页",
    bearer,
    storefrontWrite,
  ),
  doc(
    "POST",
    "/api/v1/storefront/reset",
    "创建待批准的重置请求，Agent 不能自己执行",
    bearer,
    storefrontWrite,
  ),
  doc(
    "GET",
    "/api/v1/storefront/reset/{id}",
    "查询重置请求，executed 为 false 时线上页面不变",
    bearer,
    storefrontWrite,
  ),
];

const docKey = (method: string, path: string): string => `${method} ${path}`;

const byKey = new Map(docs.map((item) => [docKey(item.method, item.path), item]));

export function interfaceOperationDoc(method: string, path: string): InterfaceOperationDoc {
  const found = byKey.get(docKey(method, path));
  if (found === undefined) {
    throw new Error(`缺少接口说明：${method} ${path}`);
  }
  return found;
}

export function interfaceSlug(method: string, path: string): string {
  return `${method} ${path}`
    .toLowerCase()
    .replace(/[{}]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function interfaceOperationBySlug(slug: string): InterfaceOperationDoc | null {
  return docs.find((item) => interfaceSlug(item.method, item.path) === slug) ?? null;
}

export function interfaceDocsMatchRegistry(): string[] {
  const listed = new Set(apiRoutes.map((route) => docKey(route.method, route.path)));
  const documented = docs.map((item) => docKey(item.method, item.path));
  const missing = [...listed].filter((key) => !byKey.has(key));
  const extra = documented.filter((key) => !listed.has(key));
  const duplicate = documented.filter((key, index) => documented.indexOf(key) !== index);
  return [...missing, ...extra, ...duplicate];
}
