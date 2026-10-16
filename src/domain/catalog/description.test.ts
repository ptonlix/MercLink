import { describe, expect, it } from "vitest";
import { validateFields } from "./attributes";
import { nextProductDescription, parseDescription } from "./catalogs";
import { isSystemFieldKey, parseFieldKey, planFieldChange } from "./fields";

describe("product description", () => {
  it("trims the ends, keeps internal line breaks, and rejects empty or oversized text", () => {
    expect(parseDescription("  第一行\n第二行  ")).toEqual({
      ok: true,
      value: "第一行\n第二行",
    });
    expect(parseDescription(null)).toEqual({ ok: true, value: null });
    expect(parseDescription("a".repeat(2000)).ok).toBe(true);
    expect(parseDescription("")).toMatchObject({ ok: false, error: "validation_error" });
    expect(parseDescription("   ")).toMatchObject({ ok: false, error: "validation_error" });
    expect(parseDescription(1)).toMatchObject({ ok: false, error: "validation_error" });
    expect(parseDescription("a".repeat(2001))).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(parseDescription(`${"a".repeat(2000)}\n`).ok).toBe(true);
  });

  it("leaves an omitted description unchanged and clears only an explicit null", () => {
    expect(nextProductDescription(null, undefined, false)).toEqual({ ok: true, value: null });
    expect(nextProductDescription("海水珍珠", undefined, false)).toEqual({
      ok: true,
      value: "海水珍珠",
    });
    expect(nextProductDescription("海水珍珠", null, true)).toEqual({ ok: true, value: null });
    expect(nextProductDescription("海水珍珠", "  改后\n第二行  ", true)).toEqual({
      ok: true,
      value: "改后\n第二行",
    });
    expect(nextProductDescription("海水珍珠", "", true)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(nextProductDescription("海水珍珠", { text: "nope" }, true)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
  });

  it("rejects description as a custom field or a new catalog field", () => {
    expect(isSystemFieldKey("description")).toBe(true);
    expect(parseFieldKey("description")).toMatchObject({ ok: false, error: "validation_error" });
    expect(validateFields([], { description: "正文" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(
      planFieldChange([], [], {
        op: "add_field",
        key: "description",
        label: "描述",
        type: "text",
        required: false,
        choices: [],
      }),
    ).toMatchObject({ ok: false, error: "validation_error" });
    expect(planFieldChange([], [], { op: "retire", key: "description" })).toMatchObject({
      ok: false,
      error: "validation_error",
    });
  });
});
