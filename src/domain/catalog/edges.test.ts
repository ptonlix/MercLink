import { describe, expect, it } from "vitest";
import { anonymousActor, scriptActor } from "../../shared/actor";
import { canReadSchema } from "./access";
import { validateFields } from "./attributes";
import { parseCover, parseSku, parseTitle, planCatalog } from "./catalogs";
import {
  convertFieldValue,
  parseFieldKey,
  parseLabel,
  parseChoices,
  planFieldChange,
  type FieldDefinition,
} from "./fields";
import { selectLockTarget, selectRestoreTarget, type LockCandidate } from "./lock";
import {
  parseCatalogBody,
  parseFieldChangeBody,
  parseFieldCreateBody,
  parseAxisBody,
  parseProductBody,
  parseProductPatch,
  parseVariantBody,
  parseVariantPatch,
} from "./parse";
import {
  encodeCursor,
  parseMerchantProductQuery,
  parsePublicQuery,
  resolveFieldFilters,
} from "./query";
import {
  assertPublishable,
  validateDeclareAxis,
  validateVariantOptions,
  type VariantState,
} from "./variants";
import { merchantListIncludes } from "./visibility";

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
  required: true,
  choices: ["黑"],
  status: "active",
};
const flag: FieldDefinition = {
  key: "folded",
  label: "可折",
  type: "boolean",
  required: false,
  choices: [],
  status: "active",
};
const note: FieldDefinition = {
  key: "note",
  label: "备注",
  type: "text",
  required: false,
  choices: [],
  status: "active",
};

function candidate(overrides: Partial<LockCandidate> = {}): LockCandidate {
  return {
    variantId: "var_1",
    productId: "prd_1",
    catalogId: "cat_1",
    title: "鞋",
    currency: "CNY",
    price: 100,
    stock: 2,
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

function variant(optionValues: Record<string, string>): VariantState {
  return { optionValues, status: "on", deleted: false, price: 100 };
}

describe("catalog edge branches", () => {
  it("rejects invalid catalog, title, cover, and sku input", () => {
    expect(planCatalog({ name: "鞋", currency: "人民币" })).toMatchObject({ ok: false });
    expect(parseTitle(1)).toMatchObject({ ok: false });
    expect(parseTitle(" ".repeat(201))).toMatchObject({ ok: false });
    expect(parseCover(1)).toMatchObject({ ok: false });
    expect(parseCover("")).toMatchObject({ ok: false });
    expect(parseSku(1)).toMatchObject({ ok: false });
    expect(parseSku("sku-1").ok).toBe(true);
    expect(parseLabel("")).toMatchObject({ ok: false });
    expect(parseFieldKey("1bad")).toMatchObject({ ok: false });
    expect(parseFieldKey("price")).toMatchObject({ ok: false });
    expect(parseChoices("text", ["x"])).toMatchObject({ ok: false });
    expect(parseChoices("single-select", [])).toMatchObject({ ok: false });
    expect(parseChoices("single-select", ["黑", "黑"])).toMatchObject({ ok: false });
    expect(parseChoices("single-select", [" "])).toMatchObject({ ok: false });
    expect(parseChoices("number", []).ok).toBe(true);
  });

  it("rejects invalid field changes and attribute writes", () => {
    expect(
      planFieldChange([weight], [], { op: "rename_label", key: "weight_g", label: "" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([{ ...weight, required: true }], [], {
        op: "make_required",
        key: "weight_g",
      }),
    ).toMatchObject({ ok: false });
    expect(planFieldChange([weight], [], { op: "make_optional", key: "weight_g" })).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([weight], [], {
        op: "add_field",
        key: "weight_g",
        label: "重量",
        type: "number",
        required: false,
        choices: [],
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      planFieldChange([weight], [], {
        op: "add_field",
        key: "bad",
        label: "",
        type: "number",
        required: false,
        choices: [],
      }),
    ).toMatchObject({ ok: false });
    expect(
      planFieldChange([weight], [], {
        op: "add_field",
        key: "size",
        label: "尺码",
        type: "text",
        required: false,
        choices: ["x"],
      }),
    ).toMatchObject({ ok: false });
    expect(
      planFieldChange([weight], [], { op: "add_choice", key: "weight_g", choice: "大" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([color], [], { op: "add_choice", key: "color", choice: "黑" }),
    ).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(
      planFieldChange([color], [], { op: "add_choice", key: "color", choice: "" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([weight], [], { op: "remove_choice", key: "weight_g", choice: "黑" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([color], [], { op: "remove_choice", key: "color", choice: "白" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      planFieldChange([weight], [], {
        op: "change_type",
        key: "weight_g",
        type: "number",
        choices: [],
      }),
    ).toMatchObject({ ok: false });
    expect(
      planFieldChange([weight], [], {
        op: "change_type",
        key: "weight_g",
        type: "single-select",
        choices: [],
      }),
    ).toMatchObject({ ok: false });
    expect(convertFieldValue(Number.NaN, "number", [])).toBeUndefined();
    expect(convertFieldValue(true, "number", [])).toBeUndefined();
    expect(convertFieldValue(false, "boolean", [])).toBe(false);
    expect(convertFieldValue("false", "boolean", [])).toBe(false);
    expect(convertFieldValue("maybe", "boolean", [])).toBeUndefined();
    expect(convertFieldValue(1, "single-select", ["1"])).toBe("1");
    expect(convertFieldValue(1, "single-select", ["2"])).toBeUndefined();
    expect(validateFields([weight], { title: "鞋" })).toMatchObject({ ok: false });
    expect(validateFields([weight], { weight_g: null })).toEqual({ ok: true, value: {} });
    expect(validateFields([note], { note: "" })).toMatchObject({ ok: false });
    expect(validateFields([note], { note: "布" }).ok).toBe(true);
    expect(validateFields([flag], { folded: "true" })).toMatchObject({ ok: false });
    expect(validateFields([color], { color: "黑" }).ok).toBe(true);
  });

  it("rejects invalid variants, locks, and queries", () => {
    expect(
      validateDeclareAxis({ declaredAxes: ["size"], existing: [], key: "size", label: "尺码" }),
    ).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(
      validateDeclareAxis({ declaredAxes: [], existing: [], key: "Price", label: "价格" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      validateDeclareAxis({ declaredAxes: [], existing: [], key: "size", label: "" }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      validateVariantOptions({
        declaredAxes: ["size"],
        existing: [],
        optionValues: { size: " " },
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateVariantOptions({
        declaredAxes: ["size"],
        existing: [variant({})],
        optionValues: {},
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      validateVariantOptions({
        declaredAxes: [],
        existing: [variant({})],
        optionValues: {},
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      validateVariantOptions({
        declaredAxes: [],
        existing: [],
        optionValues: { size: "40" },
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateVariantOptions({
        declaredAxes: ["size"],
        existing: [variant({ size: "40" })],
        optionValues: { size: "40" },
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      assertPublishable({
        deleted: false,
        fields: {},
        definitions: [],
        variants: [{ ...variant({}), status: "off" }],
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(
      assertPublishable({
        deleted: false,
        fields: {},
        definitions: [],
        variants: [variant({ size: "40" }), variant({ color: "黑" })],
      }),
    ).toMatchObject({ ok: false, error: "conflict" });
    expect(selectLockTarget([candidate()], { qty: 1 })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(selectLockTarget([], { productId: "prd_1", qty: 1 })).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(
      selectLockTarget([candidate({ price: -1 })], { variantId: "var_1", qty: 1 }),
    ).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(
      selectLockTarget([candidate({ variantId: "var_x" })], { variantId: "var_1", qty: 1 }),
    ).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(selectRestoreTarget(1, 0)).toMatchObject({ ok: false });
    expect(parsePublicQuery({ q: "x".repeat(201), fieldFilters: [] })).toMatchObject({ ok: false });
    expect(parsePublicQuery({ minPrice: "20", maxPrice: "10", fieldFilters: [] })).toMatchObject({
      ok: false,
    });
    expect(parsePublicQuery({ minPrice: "1.5", fieldFilters: [] })).toMatchObject({ ok: false });
    expect(parsePublicQuery({ limit: "0", fieldFilters: [] })).toMatchObject({ ok: false });
    expect(parsePublicQuery({ cursor: "@@@", fieldFilters: [] })).toMatchObject({ ok: false });
    expect(
      parsePublicQuery({
        cursor: Buffer.from(JSON.stringify({ createdAt: "nope", id: "prd_1" }), "utf8").toString(
          "base64url",
        ),
        fieldFilters: [],
      }),
    ).toMatchObject({ ok: false });
    expect(parseMerchantProductQuery({ deleted: "maybe" })).toMatchObject({ ok: false });
    expect(parseMerchantProductQuery({ limit: "nope" })).toMatchObject({ ok: false });
    expect(resolveFieldFilters([{ key: "1bad", op: "eq", raw: "1" }], [weight])).toMatchObject({
      ok: false,
      error: "unknown_field",
    });
    expect(
      resolveFieldFilters([{ key: "weight_g", op: "between", raw: "1" }], [weight]),
    ).toMatchObject({
      ok: false,
    });
    expect(
      resolveFieldFilters([{ key: "weight_g", op: "eq", raw: "abc" }], [weight]),
    ).toMatchObject({
      ok: false,
    });
    expect(resolveFieldFilters([{ key: "folded", op: "eq", raw: "yes" }], [flag])).toMatchObject({
      ok: false,
    });
    expect(resolveFieldFilters([{ key: "folded", op: "eq", raw: "true" }], [flag]).ok).toBe(true);
    expect(resolveFieldFilters([{ key: "color", op: "eq", raw: "白" }], [color]).ok).toBe(true);
    expect(resolveFieldFilters([{ key: "note", op: "eq", raw: "布" }], [note]).ok).toBe(true);
    const cursor = encodeCursor({ createdAt: "2026-05-16T00:00:00.000Z", id: "prd_1" });
    expect(parseMerchantProductQuery({ cursor, deleted: "false" }).ok).toBe(true);
    expect(
      merchantListIncludes({
        deleted: false,
        status: "on",
        requestDeleted: false,
        requestStatus: "off",
      }),
    ).toBe(false);
    expect(canReadSchema(anonymousActor(), "mch_1")).toBe(true);
    expect(
      canReadSchema(
        scriptActor({
          ownerType: "buyer",
          ownerId: "byr_1",
          keyId: "key_1",
          scopes: ["order:read"],
        }),
        "mch_1",
      ),
    ).toBe(true);
  });

  it("rejects malformed request bodies", () => {
    expect(parseFieldChangeBody(null)).toMatchObject({ ok: false });
    expect(parseFieldChangeBody({})).toMatchObject({ ok: false });
    expect(parseFieldChangeBody({ op: "add_field", type: "nope" })).toMatchObject({ ok: false });
    expect(parseFieldChangeBody({ op: "add_field", type: "number", choices: "x" })).toMatchObject({
      ok: false,
    });
    expect(
      parseFieldChangeBody({ op: "add_field", type: "number", key: "weight_g", label: "重量" }).ok,
    ).toBe(true);
    expect(parseFieldChangeBody({ op: "rename_label", key: "weight_g", label: "克重" }).ok).toBe(
      true,
    );
    expect(parseFieldChangeBody({ op: "add_choice", key: "color", choice: "灰" }).ok).toBe(true);
    expect(parseFieldChangeBody({ op: "change_type", key: "weight_g", type: "text" }).ok).toBe(
      true,
    );
    expect(parseFieldChangeBody({ op: "change_type", type: "number", choices: [1] })).toMatchObject(
      { ok: false },
    );
    expect(parseFieldChangeBody({ op: "retire", key: "weight_g" }).ok).toBe(true);
    expect(parseFieldCreateBody(null)).toMatchObject({ ok: false });
    expect(parseFieldCreateBody({ type: "nope" })).toMatchObject({ ok: false });
    expect(parseFieldCreateBody({ type: "text", key: "note", label: "备注" }).ok).toBe(true);
    expect(
      parseFieldCreateBody({ type: "single-select", choices: ["黑"], key: "color", label: "颜色" })
        .ok,
    ).toBe(true);
    expect(parseCatalogBody(null)).toMatchObject({ ok: false });
    expect(parseCatalogBody({})).toMatchObject({ ok: false });
    expect(parseProductBody(null)).toMatchObject({ ok: false });
    expect(parseProductBody({ title: "鞋", fields: [] })).toMatchObject({ ok: false });
    expect(parseProductBody({ fields: { color: "黑" } })).toMatchObject({ ok: false });
    expect(parseProductPatch(null)).toMatchObject({ ok: false });
    expect(parseProductPatch({ fields: [] })).toMatchObject({ ok: false });
    expect(parseProductPatch({ title: "新鞋", cover: null }).ok).toBe(true);
    expect(parseAxisBody(null)).toMatchObject({ ok: false });
    expect(parseVariantBody(null)).toMatchObject({ ok: false });
    expect(parseVariantBody({ options: { size: "42" }, price: 1 })).toMatchObject({ ok: false });
    expect(parseVariantBody({ option_values: [] })).toMatchObject({ ok: false });
    expect(parseVariantBody({ option_values: { size: 1 } })).toMatchObject({ ok: false });
    expect(parseVariantBody({ option_values: {} })).toMatchObject({ ok: false });
    expect(parseVariantPatch(null)).toMatchObject({ ok: false });
    expect(parseVariantPatch({ stock: null, sku: null, cover: null }).ok).toBe(true);
  });
});
