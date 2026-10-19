import { apiRoutes } from "../shared/api-routes";

export type ApiField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
  options?: readonly string[];
  range?: string;
};

export type ApiSection = {
  contentType: string;
  description: string;
  fields: readonly ApiField[];
};

export type ApiContract = {
  pathParams: readonly ApiField[];
  query: ApiSection | null;
  body: ApiSection | null;
  responses: readonly { status: number; section: ApiSection }[];
};

function field(
  name: string,
  type: string,
  required: boolean,
  description: string,
  extra?: { options?: readonly string[]; range?: string },
): ApiField {
  return { name, type, required, description, ...extra };
}

function jsonSection(description: string, fields: readonly ApiField[]): ApiSection {
  return { contentType: "application/json", description, fields };
}

function jsonResponse(status: number, description: string, fields: readonly ApiField[]) {
  return [{ status, section: jsonSection(description, fields) }];
}

const publicVariantFields = [
  field("variants[].id", "string", true, "规格 ID，下单时作为 variant_id"),
  field("variants[].price", "integer", true, "整数分"),
  field("variants[].currency", "string", true, "货币代码"),
  field("variants[].stock", "integer | null", true, "库存，null 表示不限"),
  field("variants[].availability", "enum<string>", true, "可售状态", {
    options: ["in_stock", "out_of_stock"],
  }),
  field("variants[].option_values", "object", true, "规格轴取值，键是轴 key"),
  field("variants[].sku", "string | null", true, "SKU，没有时为 null"),
];

const publicProductFields = [
  field("id", "string", true, "商品 ID，以 prd_ 开头"),
  field("catalog_id", "string", true, "目录 ID"),
  field("title", "string", true, "商品名称"),
  field("description", "string | null", true, "可选纯文本，没有时为 null，不是 fields 里的键"),
  field("cover", "string | null", true, "封面地址，没有时为 null"),
  field("currency", "string", true, "货币代码"),
  field("offer.price", "integer", true, "展示价，整数分"),
  field("offer.currency", "string", true, "展示价货币"),
  field("offer.availability", "enum<string>", true, "商品可售状态", {
    options: ["in_stock", "out_of_stock"],
  }),
  field("fields", "object", true, "公开字段，键是字段 key"),
  field("variants", "object[]", true, "可售规格"),
  ...publicVariantFields,
];

const merchantProductFields = [
  field("id", "string", true, "商品 ID，以 prd_ 开头"),
  field("catalog_id", "string", true, "目录 ID"),
  field("title", "string", true, "商品名称"),
  field("description", "string | null", true, "可选纯文本，没有时为 null，不是 fields 里的键"),
  field("status", "enum<string>", true, "上架状态", { options: ["on", "off"] }),
  field("cover", "string | null", true, "封面地址"),
  field("fields", "object", true, "目录字段值"),
  field("schema_revision", "integer", true, "字段定义版本"),
  field("created_at", "string", true, "创建时间，ISO-8601"),
  field("updated_at", "string", true, "更新时间，ISO-8601"),
  field("deleted_at", "string | null", true, "软删除时间，未删除时为 null"),
  field("axes[].id", "string", true, "规格轴 ID"),
  field("axes[].key", "string", true, "规格轴 key"),
  field("axes[].label", "string", true, "规格轴名称"),
  field("axes[].position", "integer", true, "规格轴顺序"),
  field("variants[].id", "string", true, "规格 ID"),
  field("variants[].sku", "string | null", true, "SKU"),
  field("variants[].option_values", "object", true, "规格轴取值"),
  field("variants[].price", "integer", true, "整数分"),
  field("variants[].stock", "integer | null", true, "库存，null 表示不限"),
  field("variants[].status", "enum<string>", true, "是否可售", { options: ["on", "off"] }),
  field("variants[].cover", "string | null", true, "规格封面"),
  field("variants[].deleted", "boolean", true, "是否已软删除"),
];

const orderFields = [
  field("id", "string", true, "订单 ID"),
  field("status", "enum<string>", true, "只有 paid 表示支付成功", {
    options: ["pending", "paid", "closed"],
  }),
  field("amount", "integer", true, "订单金额，整数分"),
  field("currency", "string", true, "货币代码"),
  field("updated_at", "string", true, "更新时间，ISO-8601"),
  field("items[].id", "string", true, "订单行 ID"),
  field("items[].variant_id", "string", true, "下单时的规格 ID"),
  field("items[].qty", "integer", true, "数量"),
  field("items[].amount", "integer", true, "行金额，整数分"),
  field("payment.id", "string", false, "支付记录 ID，没有支付记录时 payment 为 null"),
  field("payment.provider", "string", false, "支付实现，由服务端固定"),
  field("payment.channel", "enum<string>", false, "已保存的收银台", {
    options: ["desktop", "mobile"],
  }),
  field("payment.status", "string", false, "支付记录状态"),
  field("payment.action", "string | null", false, "完整支付 URL，打开它不等于已支付"),
  field("unapplied_receipt.status", "enum<string>", false, "未履约收款状态，没有时为 null", {
    options: ["open", "fulfilled_manually", "refunded", "refund_failed"],
  }),
  field("unapplied_receipt.amount", "integer", false, "收款金额，整数分"),
  field("unapplied_receipt.provider_trade_no", "string", false, "服务商交易号"),
  field("unapplied_receipt.failure_reason", "string | null", false, "失败原因，没有时为 null"),
];

const fieldFields = [
  field("id", "string", true, "字段 ID"),
  field("key", "string", true, "字段 key，创建后不能改"),
  field("label", "string", true, "显示名"),
  field("type", "enum<string>", true, "字段类型", {
    options: ["text", "number", "boolean", "single-select"],
  }),
  field("required", "boolean", true, "是否必填"),
  field("choices", "string[]", true, "单选可选项，其它类型为空"),
  field("status", "string", true, "字段状态，含停用"),
];

const catalogFields = [
  field("id", "string", true, "目录 ID，以 cat_ 开头"),
  field("name", "string", true, "目录名称"),
  field("currency", "string", true, "三位字母货币代码"),
  field("schema_revision", "integer", true, "字段定义版本"),
  field("created_at", "string", true, "创建时间，ISO-8601"),
  field("updated_at", "string", true, "更新时间，ISO-8601"),
];

const licenseFields = [
  field("license.name", "string", true, "企业名称，license 非空时必填"),
  field("license.credit_code", "string", true, "统一社会信用代码"),
  field("license.legal_person", "string", true, "法人姓名"),
  field("license.registered_address", "string", true, "注册地址，不覆盖经营地址"),
  field("license.image_url", "string", true, "执照图片地址"),
];

const contactFields = [
  field("contact.phone", "string | null", true, "客服电话，contact 非空时出现"),
  field("contact.label", "string | null", true, "客服说明"),
  field("contact.qr_url", "string | null", true, "客服二维码地址"),
];

const profileFields = [
  field("display_name", "string", true, "展示名，不超过 40 个字符"),
  field("summary", "string", true, "简介，不超过 300 个字符"),
  field("website_url", "string | null", true, "网站，http 或 https，或 null"),
  field("logo_url", "string | null", true, "标识地址，或 null"),
  field("area_served", "string | null", true, "服务区域"),
  field("address", "string | null", true, "经营地址"),
  field("license", "object | null", true, "执照，没有时为 null"),
  ...licenseFields,
  field("contact", "object | null", true, "客服，没有时为 null"),
  ...contactFields,
  field("published", "boolean", true, "为 true 时公开介绍才可见"),
  field("updated_at", "string | null", true, "更新时间，空草稿时为 null"),
];

const storeFields = profileFields.filter(
  (item) => item.name !== "published" && item.name !== "updated_at",
);

const imageFields = [
  field("id", "string", true, "图片 ID"),
  field("url", "string", true, "本站 /media/{id} 的绝对地址"),
  field("content_type", "string", true, "图片类型"),
  field("byte_size", "integer", true, "字节数"),
];

const appliedFields = [
  field("applied", "boolean", true, "true 才表示已写入，false 只是预览"),
  field("breaking", "boolean", false, "未确认的破坏性变更时为 true。已写入时不返回"),
  field("revision", "integer", false, "写入后的字段版本"),
  field("affected_count", "integer", true, "受影响商品数"),
  field("field", "object | null", false, "写入后的字段，预览时可能没有"),
  field("affected[].product_id", "string", false, "将被下架或已下架的商品 ID"),
  field("affected[].reason", "string", false, "影响原因"),
];

const productQuery = jsonSection("查询参数都可省略，价格是整数分", [
  field("q", "string", false, "同时匹配标题、商品描述和文本字段，不匹配问答，不要求目录"),
  field("limit", "integer", false, "每页数量"),
  field("cursor", "string", false, "上一页返回的 next_cursor"),
  field("catalog_id", "string", false, "目录 ID，字段过滤时必须同时带上"),
  field("min_price", "integer", false, "最低价，整数分"),
  field("max_price", "integer", false, "最高价，整数分"),
  field("field.{key}.{op}", "string", false, "自定义字段过滤，op 只能是列出的比较符", {
    options: ["gt", "lt", "eq", "gte", "lte"],
  }),
]);

const bearerJson = "成功时 code 为 200，资源在 data";

function pathParam(path: string, name: string, description: string): ApiField {
  return field(name, "string", true, description);
}

function params(path: string): ApiField[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => {
    const name = match[1] ?? "";
    const copy: Record<string, string> = {
      id: path.includes("/products/")
        ? "商品 ID"
        : path.includes("/reset/")
          ? "重置请求 ID"
          : path.includes("/releases/")
            ? "发布 ID"
            : path.includes("/catalogs/")
              ? "目录 ID"
              : "资源 ID",
      product_id: "商品 ID",
      variant_id: "规格 ID",
      paymentId: "支付记录 ID",
    };
    return pathParam(path, name, copy[name] ?? "路径参数");
  });
}

const faqItemFields = [
  field("faqs[].question", "string", true, "问题，单行纯文本"),
  field("faqs[].answer", "string", true, "答案，单行纯文本"),
];

const managedFaqFields = [
  field("published", "boolean", true, "为 true 时公开问答才出现在页面和公开 JSON"),
  field("items", "object[]", true, "整份问答。未保存时为 []"),
  field("items[].question", "string", true, "问题，去空白后 1 到 80 个字符"),
  field("items[].answer", "string", true, "答案，去空白后 1 到 400 个字符"),
  field("updated_at", "string | null", true, "更新时间，未保存时为 null"),
];

const managedFaqBody = jsonSection("published 和 items 必须都出现，不能多字段", [
  field("published", "boolean", true, "没有条目时不能为 true"),
  field("items", "object[]", true, "全店最多 12 条，商品最多 8 条"),
  field("items[].question", "string", true, "单行纯文本", { range: "1 到 80" }),
  field("items[].answer", "string", true, "单行纯文本", { range: "1 到 400" }),
]);

function readProduct(): ApiContract {
  return {
    pathParams: params("/api/v1/products/{id}"),
    query: null,
    body: null,
    responses: jsonResponse(200, "详情包含 faqs，未公开时为 []。列表项不含 faqs", [
      ...publicProductFields,
      field("faqs", "object[]", true, "该商品已公开问答，未公开或没有时为 []"),
      ...faqItemFields,
    ]),
  };
}

const contracts: Record<string, ApiContract> = {
  "GET /api/v1/products": {
    pathParams: [],
    query: productQuery,
    body: null,
    responses: jsonResponse(
      200,
      "列表在 data.items，下一页游标在 data.next_cursor。列表项不含 faqs",
      [
        field("items", "object[]", true, "已上架商品"),
        ...publicProductFields.map((item) =>
          field(`items[].${item.name}`, item.type, item.required, item.description, {
            options: item.options,
            range: item.range,
          }),
        ),
        field("next_cursor", "string | null", true, "没有下一页时为 null"),
      ],
    ),
  },
  "GET /api/v1/products/{id}": readProduct(),
  "GET /api/v1/catalogs/{id}/schema": {
    pathParams: params("/api/v1/catalogs/{id}/schema"),
    query: null,
    body: null,
    responses: jsonResponse(200, bearerJson, [
      field("catalog_id", "string", true, "目录 ID"),
      field("currency", "string", true, "目录货币"),
      field("schema_revision", "integer", true, "字段定义版本"),
      field("system_fields", "string[]", true, "不能当作自定义字段 key 的系统名"),
      field("fields", "object[]", true, "当前字段定义"),
      ...fieldFields.map((item) =>
        field(`fields[].${item.name}`, item.type, item.required, item.description, {
          options: item.options,
          range: item.range,
        }),
      ),
    ]),
  },
  "POST /api/v1/orders": {
    pathParams: [],
    query: null,
    body: jsonSection("只能有一行，不要传 price。variant_id 和 product_id 至少填一个", [
      field("client_order_no", "string", true, "幂等业务单号，重复提交返回原订单，不切换渠道"),
      field("payment_channel", "enum<string>", false, "收银台，省略时是 desktop", {
        options: ["desktop", "mobile"],
      }),
      field("items", "object[]", true, "只能有一项"),
      field("items[].variant_id", "string", false, "规格 ID。与 product_id 至少填一个"),
      field("items[].product_id", "string", false, "商品 ID。只有一条可售规格时才可传商品 ID"),
      field("items[].qty", "integer", true, "数量"),
    ]),
    responses: jsonResponse(
      201,
      "创建成功时 HTTP 201，body 的 code 仍是 200，资源在 data",
      orderFields,
    ),
  },
  "GET /api/v1/orders/{id}": {
    pathParams: params("/api/v1/orders/{id}"),
    query: null,
    body: null,
    responses: jsonResponse(200, bearerJson, orderFields),
  },
  "GET /api/v1/catalogs": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(200, "没有 next_cursor", [
      field("items", "object[]", true, "自己的目录"),
      ...catalogFields.map((item) =>
        field(`items[].${item.name}`, item.type, item.required, item.description),
      ),
    ]),
  },
  "POST /api/v1/catalogs": {
    pathParams: [],
    query: null,
    body: jsonSection("新建目录", [
      field("name", "string", true, "目录名称", { range: "1 <= 字符数 <= 80" }),
      field("currency", "string", false, "省略时为 CNY，必须是三位字母"),
    ]),
    responses: jsonResponse(201, bearerJson, catalogFields),
  },
  "GET /api/v1/catalogs/{id}/fields": {
    pathParams: params("/api/v1/catalogs/{id}/fields"),
    query: null,
    body: null,
    responses: jsonResponse(200, "没有 next_cursor", [
      field("items", "object[]", true, "目录字段"),
      ...fieldFields.map((item) =>
        field(`items[].${item.name}`, item.type, item.required, item.description, {
          options: item.options,
          range: item.range,
        }),
      ),
    ]),
  },
  "POST /api/v1/catalogs/{id}/fields": {
    pathParams: params("/api/v1/catalogs/{id}/fields"),
    query: null,
    body: jsonSection("新增字段，必填且未确认时只返回预览", [
      field("key", "string", true, "小写字母开头，只能含小写字母、数字和下划线", {
        range: "1 <= 字符数 <= 64",
      }),
      field("label", "string", true, "显示名", { range: "1 <= 字符数 <= 80" }),
      field("type", "enum<string>", true, "字段类型", {
        options: ["text", "number", "boolean", "single-select"],
      }),
      field("required", "boolean", false, "省略时不是必填"),
      field("choices", "string[]", false, "single-select 必须带，且至少一项"),
      field("confirm", "boolean", false, "破坏性新增要写成 true 才会写入"),
    ]),
    responses: jsonResponse(
      201,
      "HTTP 201 不表示已写入，先看 data.applied。未确认的破坏性变更带 breaking",
      appliedFields,
    ),
  },
  "POST /api/v1/catalogs/{id}/fields/changes": {
    pathParams: params("/api/v1/catalogs/{id}/fields/changes"),
    query: null,
    body: jsonSection("一次只做一种 op", [
      field("op", "enum<string>", true, "变更种类", {
        options: [
          "rename_label",
          "add_choice",
          "remove_choice",
          "change_type",
          "make_optional",
          "make_required",
          "retire",
        ],
      }),
      field("key", "string", true, "已有字段 key，不能改名"),
      field("label", "string", false, "rename_label 时的新显示名"),
      field("choice", "string", false, "add_choice 或 remove_choice 的选项"),
      field("type", "enum<string>", false, "change_type 的目标类型", {
        options: ["text", "number", "boolean", "single-select"],
      }),
      field("choices", "string[]", false, "改成 single-select 时必须带"),
      field("confirm", "boolean", false, "破坏性变更写成 true 才会写入"),
    ]),
    responses: jsonResponse(
      200,
      "applied 为 true 才表示已写入。未确认时先读 breaking",
      appliedFields,
    ),
  },
  "GET /api/v1/catalogs/{id}/products": {
    pathParams: params("/api/v1/catalogs/{id}/products"),
    query: jsonSection("查询参数都可省略", [
      field("status", "enum<string>", false, "按上下架过滤", { options: ["on", "off"] }),
      field("deleted", "enum<string>", false, "要看已软删除商品时传 true", { options: ["true"] }),
      field("limit", "integer", false, "每页数量"),
      field("cursor", "string", false, "上一页返回的 next_cursor"),
    ]),
    body: null,
    responses: jsonResponse(200, bearerJson, [
      field("items", "object[]", true, "商家商品，含草稿"),
      ...merchantProductFields.map((item) =>
        field(`items[].${item.name}`, item.type, item.required, item.description, {
          options: item.options,
          range: item.range,
        }),
      ),
      field("next_cursor", "string | null", true, "没有下一页时为 null"),
    ]),
  },
  "POST /api/v1/catalogs/{id}/products": {
    pathParams: params("/api/v1/catalogs/{id}/products"),
    query: null,
    body: jsonSection("新建后默认下架，价格是整数分", [
      field("title", "string", true, "商品名称"),
      field(
        "description",
        "string | null",
        false,
        "可选纯文本，最多 2000 个字符。省略为空。不能放进 fields。上架不要求",
      ),
      field("cover", "string | null", false, "封面地址，或先上传后再写"),
      field("fields", "object", false, "目录字段值，数字用 JSON 数字，是否用布尔"),
      field("price", "integer", false, "没有规格轴时写入，整数分"),
      field("stock", "integer | null", false, "没有规格轴时写入，null 表示不限"),
      field("sku", "string | null", false, "没有规格轴时的 SKU，有规格轴时不要传"),
    ]),
    responses: jsonResponse(201, bearerJson, merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/images": {
    pathParams: params("/api/v1/catalogs/{id}/images"),
    query: null,
    body: {
      contentType: "multipart/form-data",
      description: "只接受 JPEG、PNG 或 WebP，同一商家 60 秒最多 30 次",
      fields: [field("file", "binary", true, "图片文件", { range: "字节数 <= 5 MiB" })],
    },
    responses: jsonResponse(201, bearerJson, imageFields),
  },
  "PATCH /api/v1/catalogs/{id}/products/{product_id}": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}"),
    query: null,
    body: jsonSection("出现的 fields 会整份替换，不能改价格", [
      field("title", "string", false, "新标题"),
      field("description", "string | null", false, "省略不改。null 清空。不能放进 fields"),
      field("cover", "string | null", false, "新封面"),
      field("fields", "object", false, "整份替换已保存属性，省略的 key 会被去掉"),
    ]),
    responses: jsonResponse(200, bearerJson, merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/products/{product_id}/publish": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}/publish"),
    query: null,
    body: null,
    responses: jsonResponse(200, "缺少必填字段或没有可售规格时保持下架", merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/products/{product_id}/unpublish": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}/unpublish"),
    query: null,
    body: null,
    responses: jsonResponse(200, bearerJson, merchantProductFields),
  },
  "DELETE /api/v1/catalogs/{id}/products/{product_id}": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}"),
    query: null,
    body: null,
    responses: jsonResponse(200, "软删除，没有物理删除", merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/products/{product_id}/restore": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}/restore"),
    query: null,
    body: null,
    responses: jsonResponse(200, "恢复后仍是下架", merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/products/{product_id}/axes": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}/axes"),
    query: null,
    body: jsonSection("一次声明一条轴", [
      field("key", "string", true, "规格轴 key，规则与目录字段 key 相同"),
      field("label", "string", true, "规格轴名称"),
    ]),
    responses: jsonResponse(201, bearerJson, merchantProductFields),
  },
  "POST /api/v1/catalogs/{id}/products/{product_id}/variants": {
    pathParams: params("/api/v1/catalogs/{id}/products/{product_id}/variants"),
    query: null,
    body: jsonSection("不会自动生成全部组合", [
      field("option_values", "object", true, "已声明规格轴的取值"),
      field("price", "integer", true, "整数分"),
      field("stock", "integer | null", false, "库存，null 表示不限"),
      field("sku", "string | null", false, "SKU"),
      field("cover", "string | null", false, "规格封面"),
    ]),
    responses: jsonResponse(201, bearerJson, merchantProductFields),
  },
  "PATCH /api/v1/catalogs/{id}/variants/{variant_id}": {
    pathParams: params("/api/v1/catalogs/{id}/variants/{variant_id}"),
    query: null,
    body: jsonSection("字段都可省略，恢复后仍不可售", [
      field("price", "integer", false, "整数分"),
      field("stock", "integer | null", false, "库存"),
      field("sku", "string | null", false, "SKU"),
      field("cover", "string | null", false, "封面"),
      field("status", "enum<string>", false, "可售状态", { options: ["on", "off"] }),
      field("restore", "boolean", false, "true 只恢复软删除，不会同时变成可售"),
    ]),
    responses: jsonResponse(200, bearerJson, merchantProductFields),
  },
  "DELETE /api/v1/catalogs/{id}/variants/{variant_id}": {
    pathParams: params("/api/v1/catalogs/{id}/variants/{variant_id}"),
    query: null,
    body: null,
    responses: jsonResponse(200, "软删除规格", merchantProductFields),
  },
  "GET /api/v1/manage/orders": {
    pathParams: [],
    query: jsonSection("查询参数可省略", [
      field("catalog_id", "string", false, "只看这一本目录的订单"),
    ]),
    body: null,
    responses: jsonResponse(200, "没有 next_cursor", [
      field("items", "object[]", true, "本店订单"),
      ...orderFields.map((item) =>
        field(`items[].${item.name}`, item.type, item.required, item.description, {
          options: item.options,
          range: item.range,
        }),
      ),
    ]),
  },
  "POST /api/v1/manage/payments/{paymentId}/unapplied-receipt": {
    pathParams: params("/api/v1/manage/payments/{paymentId}/unapplied-receipt"),
    query: null,
    body: jsonSection("不会把订单改成 paid，也不改库存", [
      field("action", "enum<string>", true, "处理方式", {
        options: ["fulfill_manually", "refund"],
      }),
    ]),
    responses: jsonResponse(200, bearerJson, orderFields),
  },
  "GET /api/v1/merchant/profile": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(200, "未保存时返回空草稿，不是 404", profileFields),
  },
  "PUT /api/v1/merchant/profile": {
    pathParams: [],
    query: null,
    body: jsonSection("九个字段必须都出现，空值用 null", [
      field("display_name", "string", true, "展示名", { range: "发布时不能为空，且 <= 40" }),
      field("summary", "string", true, "简介", { range: "发布时不能为空，且 <= 300" }),
      field("website_url", "string | null", true, "http 或 https，或 null", { range: "<= 200" }),
      field("logo_url", "string | null", true, "标识地址，或 null", { range: "<= 200" }),
      field("area_served", "string | null", true, "服务区域，或 null"),
      field("address", "string | null", true, "经营地址，或 null"),
      field("license", "object | null", true, "执照，或 null"),
      ...licenseFields,
      field("contact", "object | null", true, "客服，或 null"),
      ...contactFields,
      field("published", "boolean", true, "是否公开"),
    ]),
    responses: jsonResponse(200, bearerJson, profileFields),
  },
  "POST /api/v1/merchant/profile/images": {
    pathParams: [],
    query: null,
    body: {
      contentType: "multipart/form-data",
      description: "上传后即可按地址读取，但不会发布介绍",
      fields: [
        field("file", "binary", true, "执照或客服二维码"),
        field("purpose", "enum<string>", true, "用途", { options: ["license", "contact_qr"] }),
      ],
    },
    responses: jsonResponse(201, bearerJson, [
      ...imageFields,
      field("purpose", "enum<string>", true, "上传用途", { options: ["license", "contact_qr"] }),
    ]),
  },
  "GET /api/v1/merchant/faqs": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(
      200,
      "未保存时 published 为 false，items 为 []，updated_at 为 null",
      managedFaqFields,
    ),
  },
  "PUT /api/v1/merchant/faqs": {
    pathParams: [],
    query: null,
    body: managedFaqBody,
    responses: jsonResponse(200, bearerJson, managedFaqFields),
  },
  "GET /api/v1/catalogs/{id}/products/{product_id}/faqs": {
    pathParams: [
      field("id", "string", true, "目录 ID"),
      field("product_id", "string", true, "商品 ID"),
    ],
    query: null,
    body: null,
    responses: jsonResponse(
      200,
      "未保存时 published 为 false，items 为 []，updated_at 为 null",
      managedFaqFields,
    ),
  },
  "PUT /api/v1/catalogs/{id}/products/{product_id}/faqs": {
    pathParams: [
      field("id", "string", true, "目录 ID"),
      field("product_id", "string", true, "商品 ID"),
    ],
    query: null,
    body: managedFaqBody,
    responses: jsonResponse(200, bearerJson, managedFaqFields),
  },
  "GET /api/v1/store": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(
      200,
      "介绍已发布时原有字段都在并附加 faqs，问答未公开时 faqs 为 []。介绍未发布但全店问答已公开且非空时 data 只有 faqs。两者都不可见或商家停用、删除时 404，不回显草稿",
      [
        ...storeFields,
        field(
          "faqs",
          "object[]",
          true,
          "已公开全店问答。介绍已发布但问答未公开时为 []。只有问答公开时这是 data 里唯一的字段",
        ),
        ...faqItemFields,
      ],
    ),
  },
  "POST /api/v1/payments/alipay/notify": {
    pathParams: [],
    query: null,
    body: {
      contentType: "application/x-www-form-urlencoded",
      description: "由支付宝提交，先验签，验签失败不改状态",
      fields: [],
    },
    responses: [
      {
        status: 200,
        section: {
          contentType: "text/plain",
          description: "success 或 fail，不是 JSON",
          fields: [],
        },
      },
    ],
  },
  "GET /api/v1/payments/easypay/notify": {
    pathParams: [],
    query: {
      contentType: "application/x-www-form-urlencoded",
      description: "由易支付提交，先验签，只有 TRADE_SUCCESS 且金额一致才记账",
      fields: [],
    },
    body: null,
    responses: [
      {
        status: 200,
        section: {
          contentType: "text/plain",
          description: "success 或 fail，不是 JSON",
          fields: [],
        },
      },
    ],
  },
  "POST /api/v1/payments/easypay/notify": {
    pathParams: [],
    query: null,
    body: {
      contentType: "application/x-www-form-urlencoded",
      description: "规则与 GET 相同",
      fields: [],
    },
    responses: [
      {
        status: 200,
        section: {
          contentType: "text/plain",
          description: "success 或 fail，不是 JSON",
          fields: [],
        },
      },
    ],
  },
  "GET /.well-known/oauth-protected-resource": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(200, "没有 code、message、data 外壳", [
      field("resource", "string", true, "受保护资源标识，是本站 /api/v1"),
      field("authorization_servers", "string[]", true, "授权服务器，是本站 /oauth"),
      field("bearer_methods_supported", "string[]", true, "令牌传递方式", { options: ["header"] }),
      field("scopes_supported", "string[]", true, "可申请的权限名"),
    ]),
  },
  "GET /api/v1/storefront/source": {
    pathParams: [],
    query: null,
    body: null,
    responses: [
      {
        status: 200,
        section: {
          contentType: "application/zip",
          description: "文件名 storefront-source.zip",
          fields: [],
        },
      },
    ],
  },
  "POST /api/v1/storefront/releases": {
    pathParams: [],
    query: null,
    body: {
      contentType: "multipart/form-data",
      description: "上传成功不会切换线上页面",
      fields: [
        field("source", "binary", true, "源码包"),
        field("static", "binary", true, "静态包"),
        field("fallback", "enum<string>", false, "未知路径回退，只能是首页", {
          options: ["index.html"],
        }),
        field("authorize_buyer", "string", false, "买家授权外观在静态包中的路径，不要加前导斜杠"),
        field(
          "authorize_merchant",
          "string",
          false,
          "商家授权外观在静态包中的路径，不要加前导斜杠",
        ),
      ],
    },
    responses: jsonResponse(201, "active 为 false", [
      field("id", "string", true, "发布 ID"),
      field("active", "boolean", true, "上传后仍是 false"),
    ]),
  },
  "POST /api/v1/storefront/releases/{id}/activate": {
    pathParams: params("/api/v1/storefront/releases/{id}/activate"),
    query: null,
    body: jsonSection("未确认不会改指针", [field("confirm", "boolean", true, "必须是 true")]),
    responses: jsonResponse(200, bearerJson, [
      field("id", "string", true, "发布 ID"),
      field("active", "boolean", true, "确认后为 true"),
    ]),
  },
  "POST /api/v1/storefront/rollback": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(200, "没有上一份时回到内置页", [
      field("active_release_id", "string | null", true, "当前线上发布，没有时为 null"),
    ]),
  },
  "POST /api/v1/storefront/reset": {
    pathParams: [],
    query: null,
    body: null,
    responses: jsonResponse(200, "只创建待批准请求", [
      field("id", "string", true, "重置请求 ID"),
      field("status", "string", true, "请求状态"),
      field("approval_url", "string", true, "交给人在浏览器批准的地址"),
      field("executed", "boolean", true, "创建时为 false"),
    ]),
  },
  "GET /api/v1/storefront/reset/{id}": {
    pathParams: params("/api/v1/storefront/reset/{id}"),
    query: null,
    body: null,
    responses: jsonResponse(200, "executed 为 false 时线上页面不变", [
      field("id", "string", true, "重置请求 ID"),
      field("status", "string", true, "请求状态"),
      field("approval_url", "string", true, "批准地址"),
      field("executed", "boolean", true, "是否已执行"),
    ]),
  },
};

export function interfaceContract(method: string, path: string): ApiContract {
  const contract = contracts[`${method} ${path}`];
  if (contract === undefined) {
    throw new Error(`缺少字段说明：${method} ${path}`);
  }
  return contract;
}

export function interfaceContractsMatchRegistry(): string[] {
  const listed = new Set(apiRoutes.map((route) => `${route.method} ${route.path}`));
  const documented = Object.keys(contracts);
  return [
    ...[...listed].filter((key) => contracts[key] === undefined),
    ...documented.filter((key) => !listed.has(key)),
  ];
}
