import { describe, expect, it } from "vitest";
import { buyerActor, merchantActor, scriptActor } from "../../shared/actor";
import { canReadSchema, requireMerchantScope } from "./access";
import { missingRequired, publicFields, validateFields } from "./attributes";
import {
  defaultCatalogName,
  defaultCatalogPlan,
  parseCover,
  parseMinorPrice,
  parseSku,
  parseStock,
  parseTitle,
  planCatalog,
} from "./catalogs";
import {
  activeFields,
  convertFieldValue,
  fieldSnapshot,
  isFieldKey,
  isSystemFieldKey,
  planFieldChange,
  type FieldDefinition,
  type FieldProduct,
} from "./fields";
import { selectLockTarget, selectRestoreTarget, type LockCandidate } from "./lock";
import {
  parseCatalogBody,
  parseFieldChangeBody,
  parseFieldCreateBody,
  parseAxisBody,
  parseProductBody,
  parseVariantBody,
  parseVariantPatch,
} from "./parse";
import {
  encodeCursor,
  likePattern,
  parseMerchantProductQuery,
  parsePublicQuery,
  resolveFieldFilters,
  textFieldKeys,
} from "./query";
import { catalogFail, isCatalogFailure } from "./result";
import {
  afterRestoreProduct,
  afterRestoreVariant,
  afterSoftDelete,
  assertPublishable,
  validateDeclareAxis,
  validateVariantOptions,
  type VariantState,
} from "./variants";
import {
  availability,
  isPubliclyVisible,
  merchantListIncludes,
  offerFrom,
  sellableOnly,
} from "./visibility";

const weight: FieldDefinition = {
  key: "weight_g",
  label: "重量",
  type: "number",
  required: false,
  choices: [],
  status: "active",
};
const color: FieldDefinition = {
  key: "color",
  label: "颜色",
  type: "single-select",
  required: false,
  choices: ["黑", "白"],
  status: "active",
};

function product(
  id: string,
  status: "on" | "off",
  fields: FieldProduct["fields"] = {},
): FieldProduct {
  return { id, status, deleted: false, fields };
}

function variant(optionValues: Record<string, string>, status: "on" | "off" = "on"): VariantState {
  return { optionValues, status, deleted: false, price: 100 };
}

function candidate(overrides: Partial<LockCandidate> = {}): LockCandidate {
  return {
    variantId: "var_1",
    productId: "prd_1",
    catalogId: "cat_1",
    title: "鞋",
    currency: "CNY",
    price: 159900,
    stock: 4,
    sku: null,
    optionValues: {},
    fields: {},
    schemaRevision: 1,
    variantStatus: "on",
    productStatus: "on",
    productDeleted: false,
    catalogDeleted: false,
    variantDeleted: false,
    ...overrides,
  };
}

describe("catalog field rules", () => {
  it("adds an optional field without unpublishing", () => {
    const plan = planFieldChange([weight], [product("prd_1", "on", { weight_g: 480 })], {
      op: "add_field",
      key: "note",
      label: "备注",
      type: "text",
      required: false,
      choices: [],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.value.breaking).toBe(false);
    expect(plan.value.effects[0]).toMatchObject({
      nextStatus: "on",
      unpublish: false,
      fieldsChanged: false,
    });
    expect(activeFields(plan.value.nextFields).map((field) => field.key)).toEqual([
      "weight_g",
      "note",
    ]);
  });

  it("previews a required field and unpublishes missing products when applied", () => {
    const published = product("prd_on", "on");
    const plan = planFieldChange([], [published, product("prd_off", "off", { weight_g: 1 })], {
      op: "add_field",
      key: "weight_g",
      label: "重量",
      type: "number",
      required: true,
      choices: [],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.value.breaking).toBe(true);
    expect(plan.value.effects.find((effect) => effect.productId === "prd_on")).toMatchObject({
      unpublish: true,
      reason: "missing_required",
      nextFields: {},
    });
    expect(plan.value.effects.find((effect) => effect.productId === "prd_off")?.unpublish).toBe(
      false,
    );
  });

  it("converts text 480 to number and clears values that cannot convert", () => {
    expect(convertFieldValue("480", "number", [])).toBe(480);
    expect(convertFieldValue("nope", "number", [])).toBeUndefined();
    expect(convertFieldValue(true, "text", [])).toBe("true");
    expect(convertFieldValue("true", "boolean", [])).toBe(true);
    expect(convertFieldValue("黑", "single-select", ["黑"])).toBe("黑");
    const plan = planFieldChange(
      [{ ...weight, type: "text" }],
      [product("prd_ok", "on", { weight_g: "480" }), product("prd_bad", "on", { weight_g: "abc" })],
      { op: "change_type", key: "weight_g", type: "number", choices: [] },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.value.effects.find((effect) => effect.productId === "prd_ok")).toMatchObject({
      nextStatus: "on",
      nextFields: { weight_g: 480 },
    });
    expect(plan.value.effects.find((effect) => effect.productId === "prd_bad")).toMatchObject({
      nextStatus: "off",
      reason: "conversion_failed",
      nextFields: {},
    });
  });

  it("rejects key changes and retired key reuse", () => {
    const retired = { ...weight, status: "retired" as const };
    expect(
      planFieldChange([weight], [], { op: "rename_key", key: "weight_g", nextKey: "mass" }).ok,
    ).toBe(false);
    const reuse = planFieldChange([retired], [], {
      op: "add_field",
      key: "weight_g",
      label: "重量",
      type: "number",
      required: false,
      choices: [],
    });
    expect(reuse).toMatchObject({ ok: false, error: "conflict" });
    expect(planFieldChange([weight], [], { op: "retire", key: "title" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(isFieldKey("Weight")).toBe(false);
    expect(isSystemFieldKey("price")).toBe(true);
    expect(fieldSnapshot(weight).key).toBe("weight_g");
  });

  it("covers label, option, required, and retire changes", () => {
    expect(
      planFieldChange([weight], [], { op: "rename_label", key: "weight_g", label: "克重" }).ok,
    ).toBe(true);
    expect(planFieldChange([color], [], { op: "add_choice", key: "color", choice: "灰" }).ok).toBe(
      true,
    );
    const removed = planFieldChange([color], [product("prd_1", "on", { color: "黑" })], {
      op: "remove_choice",
      key: "color",
      choice: "黑",
    });
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.value.effects[0]).toMatchObject({ unpublish: true, reason: "removed_choice" });
    }
    expect(planFieldChange([weight], [], { op: "make_required", key: "weight_g" }).ok).toBe(true);
    expect(
      planFieldChange([{ ...weight, required: true }], [], { op: "make_optional", key: "weight_g" })
        .ok,
    ).toBe(true);
    const retired = planFieldChange([weight], [product("prd_1", "on", { weight_g: 1 })], {
      op: "retire",
      key: "weight_g",
    });
    expect(retired.ok).toBe(true);
    if (retired.ok) {
      expect(retired.value.nextFields[0]?.status).toBe("retired");
      expect(retired.value.effects[0]?.nextFields).toEqual({});
      expect(retired.value.effects[0]?.unpublish).toBe(false);
    }
    expect(planFieldChange([], [], { op: "make_required", key: "missing" })).toMatchObject({
      ok: false,
      error: "unknown_field",
    });
    expect(
      planFieldChange([retiredField()], [], { op: "rename_label", key: "weight_g", label: "新" }),
    ).toMatchObject({ ok: false, error: "field_retired" });
  });
});

describe("attributes, variants, and visibility", () => {
  it("rejects unknown keys and price stored as fields", () => {
    expect(validateFields([weight], { missing: 1 })).toMatchObject({
      ok: false,
      error: "unknown_field",
    });
    expect(validateFields([weight], { price: 10 })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(validateFields([retiredField()], { weight_g: 1 })).toMatchObject({
      ok: false,
      error: "field_retired",
    });
    expect(validateFields([color], { color: "红" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(validateFields([weight], { weight_g: 480 }).ok).toBe(true);
    expect(validateFields([{ ...weight, type: "text" }], { weight_g: "棉" }).ok).toBe(true);
    expect(validateFields([{ ...weight, type: "boolean" }], { weight_g: true }).ok).toBe(true);
    expect(missingRequired([{ ...weight, required: true }], {})?.key).toBe("weight_g");
    expect(publicFields([weight, retiredField()], { weight_g: 1, color: "黑" })).toEqual({
      weight_g: 1,
    });
  });

  it("rejects mixed axes and blocks publish while the default variant is sellable", () => {
    expect(
      validateVariantOptions({
        declaredAxes: ["size"],
        existing: [variant({ size: "40" })],
        optionValues: { color: "黑" },
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      validateVariantOptions({
        declaredAxes: ["size"],
        existing: [],
        optionValues: { size: "42" },
      }).ok,
    ).toBe(true);
    const blocked = assertPublishable({
      deleted: false,
      fields: {},
      definitions: [],
      variants: [variant({}), variant({ size: "40" })],
    });
    expect(blocked).toMatchObject({ ok: false, error: "conflict" });
    expect(
      assertPublishable({
        deleted: false,
        fields: {},
        definitions: [{ ...weight, required: true }],
        variants: [variant({})],
      }),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(
      assertPublishable({ deleted: true, fields: {}, definitions: [], variants: [variant({})] }),
    ).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(
      assertPublishable({
        deleted: false,
        fields: { weight_g: 1 },
        definitions: [{ ...weight, required: true }],
        variants: [variant({ size: "40" }), { ...variant({}), status: "off" }],
      }).ok,
    ).toBe(true);
    expect(
      validateDeclareAxis({
        declaredAxes: [],
        existing: [variant({ size: "40" })],
        key: "color",
        label: "颜色",
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(afterSoftDelete()).toEqual({ status: "off" });
    expect(afterRestoreProduct()).toEqual({ status: "off", deleted: false });
    expect(afterRestoreVariant()).toEqual({ status: "off", deleted: false });
  });

  it("hides unsellable variants from the public view", () => {
    const variants = [variant({}), { ...variant({ size: "40" }), status: "off" as const }];
    expect(isPubliclyVisible({ status: "on", deleted: false }, variants)).toBe(true);
    expect(sellableOnly(variants)).toHaveLength(1);
    expect(isPubliclyVisible({ status: "off", deleted: false }, variants)).toBe(false);
    expect(availability(0)).toBe("out_of_stock");
    expect(availability(null)).toBe("in_stock");
    expect(
      offerFrom([
        { price: 20, stock: 0 },
        { price: 10, stock: 1 },
      ]),
    ).toEqual({
      price: 10,
      availability: "in_stock",
    });
    expect(offerFrom([])).toBeUndefined();
    expect(merchantListIncludes({ deleted: true, status: "off", requestDeleted: false })).toBe(
      false,
    );
    expect(
      merchantListIncludes({
        deleted: false,
        status: "off",
        requestDeleted: false,
        requestStatus: "off",
      }),
    ).toBe(true);
  });
});

describe("query, lock, and access", () => {
  it("rejects a field filter without a catalog and unknown fields", () => {
    expect(
      parsePublicQuery({ fieldFilters: [{ key: "weight_g", op: "lte", raw: "500" }] }),
    ).toMatchObject({ ok: false, error: "validation_error" });
    const parsed = parsePublicQuery({
      catalogId: "cat_1",
      q: "鞋",
      limit: "20",
      minPrice: "100",
      maxPrice: "200",
      fieldFilters: [{ key: "weight_g", op: "lte", raw: "500" }],
    });
    expect(parsed.ok).toBe(true);
    expect(resolveFieldFilters([{ key: "nope", op: "eq", raw: "1" }], [weight])).toMatchObject({
      ok: false,
      error: "unknown_field",
    });
    expect(
      resolveFieldFilters([{ key: "weight_g", op: "lte", raw: "500" }], [retiredField()]),
    ).toMatchObject({
      ok: false,
      error: "field_retired",
    });
    expect(resolveFieldFilters([{ key: "weight_g", op: "lte", raw: "500" }], [weight]).ok).toBe(
      true,
    );
    expect(resolveFieldFilters([{ key: "color", op: "gt", raw: "黑" }], [color])).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parsePublicQuery({ limit: "99", fieldFilters: [] })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parseMerchantProductQuery({ status: "off", deleted: "true" }).ok).toBe(true);
    expect(parseMerchantProductQuery({ status: "gone" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    const cursor = encodeCursor({ createdAt: "2026-05-16T00:00:00.000Z", id: "prd_1" });
    expect(parsePublicQuery({ cursor, fieldFilters: [] }).ok).toBe(true);
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(textFieldKeys([{ ...weight, type: "text" }])).toEqual(["weight_g"]);
  });

  it("requires a variant when several sellable rows match a product", () => {
    const many = selectLockTarget(
      [candidate(), candidate({ variantId: "var_2", optionValues: { size: "42" } })],
      { productId: "prd_1", qty: 1 },
    );
    expect(many).toMatchObject({ ok: false, error: "variant_required" });
    const locked = selectLockTarget([candidate({ stock: 4 })], { variantId: "var_1", qty: 1 });
    expect(locked.ok).toBe(true);
    if (locked.ok) {
      expect(locked.value.nextStock).toBe(3);
      expect(Number.isInteger(locked.value.unitPrice)).toBe(true);
    }
    expect(
      selectLockTarget([candidate({ stock: 0 })], { variantId: "var_1", qty: 1 }),
    ).toMatchObject({
      ok: false,
      error: "insufficient_stock",
    });
    expect(
      selectLockTarget([candidate({ productStatus: "off" })], { variantId: "var_1", qty: 1 }),
    ).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(selectLockTarget([candidate({ stock: null })], { productId: "prd_1", qty: 2 }).ok).toBe(
      true,
    );
    expect(selectLockTarget([], { qty: 0 })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(selectRestoreTarget(undefined, 1)).toMatchObject({ ok: false, error: "not_found" });
    expect(selectRestoreTarget(null, 1)).toEqual({ ok: true, value: null });
    expect(selectRestoreTarget(2, 1)).toEqual({ ok: true, value: 3 });
  });

  it("rejects a buyer and allows the owning merchant", () => {
    const buyer = buyerActor({ buyerId: "byr_1", grantId: "grn_1", scopes: ["order:write"] });
    expect(requireMerchantScope(buyer, "product:write")).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    const merchant = merchantActor({
      merchantId: "mch_1",
      grantId: "grn_2",
      scopes: ["product:read"],
    });
    expect(requireMerchantScope(merchant, "product:write")).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(requireMerchantScope(merchant, "product:read").ok).toBe(true);
    const script = scriptActor({
      ownerType: "merchant",
      ownerId: "mch_1",
      keyId: "key_1",
      scopes: ["product:write"],
    });
    expect(requireMerchantScope(script, "product:write").ok).toBe(true);
    expect(canReadSchema(buyer, "mch_2")).toBe(true);
    expect(canReadSchema(merchant, "mch_2")).toBe(false);
    expect(canReadSchema(undefined, "mch_2")).toBe(true);
    expect(isCatalogFailure(catalogFail("not_found", "没有找到。"))).toBe(true);
  });
});

describe("request parsing", () => {
  it("parses catalog, product, and field bodies", () => {
    expect(planCatalog({ name: "跑鞋" })).toEqual({
      ok: true,
      value: { name: "跑鞋", currency: "CNY" },
    });
    expect(planCatalog({ name: " ", currency: "cny" })).toMatchObject({ ok: false });
    expect(defaultCatalogPlan()).toEqual({ name: defaultCatalogName, currency: "CNY" });
    expect(parseMinorPrice(10.5)).toMatchObject({ ok: false, error: "validation_error" });
    expect(parseMinorPrice(159900).ok).toBe(true);
    expect(parseStock(null)).toEqual({ ok: true, value: null });
    expect(parseStock(-1).ok).toBe(false);
    expect(parseTitle(" 鞋 ").ok).toBe(true);
    expect(parseCover(" https://img.example/a.png ").ok).toBe(true);
    expect(parseSku("").ok).toBe(false);
    expect(parseCatalogBody({ name: "跑鞋", currency: "CNY" }).ok).toBe(true);
    expect(parseCatalogBody([])).toMatchObject({ ok: false });
    expect(parseProductBody({ title: "鞋", price: 100, fields: { weight_g: 1 } }).ok).toBe(true);
    expect(
      parseFieldCreateBody({ key: "weight_g", label: "重量", type: "number", required: false }).ok,
    ).toBe(true);
    expect(parseFieldChangeBody({ op: "make_required", key: "weight_g" }).ok).toBe(true);
    expect(parseFieldChangeBody({ op: "rename_key", key: "weight_g", next_key: "mass" }).ok).toBe(
      true,
    );
    expect(parseFieldChangeBody({ op: "nope" })).toMatchObject({ ok: false });
    expect(parseAxisBody({ key: "size", label: "尺码" }).ok).toBe(true);
    expect(parseVariantBody({ option_values: { size: "42" }, price: 100 }).ok).toBe(true);
    expect(parseVariantPatch({ status: "off", restore: true }).ok).toBe(true);
    expect(parseVariantPatch({ status: "gone" })).toMatchObject({ ok: false });
    expect(parseProductBody({ title: 1 })).toMatchObject({ ok: false });
  });
});

function retiredField(): FieldDefinition {
  return { ...weight, status: "retired" };
}
