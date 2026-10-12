import type { ApiField, ApiSection } from "./interface-fields";

type ExampleNode = {
  key: string;
  array: boolean;
  field: ApiField | undefined;
  children: ExampleNode[];
};

export function sectionExample(
  section: ApiSection,
  kind: "json" | "query" | "form",
): string | null {
  if (section.contentType === "text/plain") {
    return "success";
  }
  if (section.contentType === "application/zip") {
    return "storefront-source.zip";
  }
  if (section.fields.length === 0) {
    return null;
  }
  if (kind === "query" || section.contentType === "application/x-www-form-urlencoded") {
    return section.fields
      .map(
        (field) =>
          `${encodeURIComponent(exampleKey(field))}=${encodeURIComponent(leafText(field))}`,
      )
      .join("&");
  }
  if (kind === "form" || section.contentType === "multipart/form-data") {
    return section.fields.map((field) => `${field.name}: ${leafText(field)}`).join("\n");
  }
  return JSON.stringify(objectFrom(section.fields), null, 2);
}

export function bodyExampleKind(section: ApiSection): "json" | "form" {
  return section.contentType === "multipart/form-data" ? "form" : "json";
}

export function pathExample(path: string, params: readonly ApiField[]): string {
  return params.reduce(
    (current, param) =>
      current.replaceAll(`{${param.name}}`, leafText({ ...param, required: true })),
    path,
  );
}

function objectFrom(fields: readonly ApiField[]): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const node of buildTree(fields)) {
    value[node.key] = valueOf(node);
  }
  return value;
}

function buildTree(fields: readonly ApiField[]): ExampleNode[] {
  const roots: ExampleNode[] = [];
  const index = new Map<string, ExampleNode>();
  for (const field of fields) {
    const parts = splitName(field.name);
    let parent: ExampleNode[] = roots;
    let parentKey = "";
    parts.forEach((part, position) => {
      const id = `${parentKey}/${part.key}`;
      let node = index.get(id);
      if (node === undefined) {
        node = { key: part.key, array: part.array, field: undefined, children: [] };
        index.set(id, node);
        parent.push(node);
      }
      node.array = node.array || part.array;
      if (position === parts.length - 1) {
        node.field = field;
        node.array = node.array || field.type.includes("[]");
      }
      parent = node.children;
      parentKey = id;
    });
  }
  return roots;
}

function splitName(name: string): { key: string; array: boolean }[] {
  if (name.includes("{")) {
    return [{ key: name, array: false }];
  }
  return name
    .split(".")
    .map((part) =>
      part.endsWith("[]") ? { key: part.slice(0, -2), array: true } : { key: part, array: false },
    );
}

function valueOf(node: ExampleNode): unknown {
  if (node.children.length > 0) {
    const object: Record<string, unknown> = {};
    for (const child of node.children) {
      object[child.key] = valueOf(child);
    }
    return node.array ? [object] : object;
  }
  return node.field === undefined ? null : leafValue(node.field);
}

function exampleKey(field: ApiField): string {
  if (field.name.includes("{key}") && field.name.includes("{op}")) {
    return `field.weight_g.${field.options?.[0] ?? "eq"}`;
  }
  return field.name;
}

function leafText(field: ApiField): string {
  const value = leafValue(field);
  return typeof value === "string" ? value : JSON.stringify(value);
}

function leafValue(field: ApiField): unknown {
  const nullable = field.type.includes("null");
  const base = field.type.replace(" | null", "");
  if (!field.required && nullable) {
    return null;
  }
  if (base.startsWith("enum")) {
    return field.options?.[0] ?? "string";
  }
  if (base === "boolean") {
    return field.required;
  }
  if (base === "integer") {
    return integerSample(field);
  }
  if (base === "string[]") {
    return field.options === undefined ? ["string"] : [...field.options];
  }
  if (base === "object[]") {
    return [{}];
  }
  if (base === "object") {
    return {};
  }
  if (base === "binary") {
    return "<file>";
  }
  return stringSample(field);
}

function integerSample(field: ApiField): number | null {
  const name = leafName(field.name);
  if (name === "price" || name === "amount" || name.endsWith("_price")) {
    return 159900;
  }
  if (name === "timestamp") {
    return 1_715_817_600_000;
  }
  if (name === "qty" || name === "byte_size") {
    return 1;
  }
  if (name === "stock" && field.type.includes("null")) {
    return null;
  }
  return 1;
}

function stringSample(field: ApiField): string {
  const name = leafName(field.name);
  const description = field.description;
  if (description.includes("cat_") || description.includes("目录 ID")) {
    return "cat_example";
  }
  if (description.includes("prd_") || description.includes("商品 ID") || name === "product_id") {
    return "prd_example";
  }
  if (description.includes("支付记录")) {
    return "pay_example";
  }
  if (name === "variant_id" || description.includes("规格 ID")) {
    return "var_example";
  }
  if (description.includes("req_")) {
    return "req_example";
  }
  if (name.endsWith("_url")) {
    return "https://example.test/resource";
  }
  if (name.endsWith("_at")) {
    return "2026-05-16T00:00:00.000Z";
  }
  if (name === "currency") {
    return "CNY";
  }
  if (name === "client_order_no") {
    return "agent-20260516-001";
  }
  if (name === "key") {
    return "weight_g";
  }
  if (name === "q") {
    return "短靴";
  }
  if (name === "credit_code") {
    return "91110000EXAMPLE";
  }
  if (name === "id" || name.endsWith("_id") || name === "paymentId") {
    return `${name}_example`;
  }
  if (
    name === "name" ||
    name === "title" ||
    name === "label" ||
    name === "display_name" ||
    name === "summary"
  ) {
    return "示例";
  }
  return "string";
}

function leafName(name: string): string {
  const tail = name.split(".").pop() ?? name;
  return tail.replace("[]", "");
}
