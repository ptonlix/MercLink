import { describe, expect, it } from "vitest";
import { parseFaqBody } from "./faqs";

const secrets = { phone: "13800138000", email: "Owner@Example.com" };

describe("faq parser", () => {
  it("accepts an empty unpublished list and trims before counting characters", () => {
    const parsed = parseFaqBody(
      {
        published: false,
        items: [{ question: "  问题  ", answer: ` ${"答".repeat(400)} ` }],
      },
      "store",
      secrets,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.items[0]).toEqual({ question: "问题", answer: "答".repeat(400) });
    expect(parseFaqBody({ published: false, items: [] }, "product", secrets)).toEqual({
      ok: true,
      value: { published: false, items: [] },
    });
    expect(
      parseFaqBody(
        { published: true, items: [{ question: "🙂".repeat(80), answer: "可以" }] },
        "product",
        secrets,
      ).ok,
    ).toBe(true);
  });

  it("rejects markup, length, duplicates, secrets, and empty publication without a value", () => {
    const failures = [
      parseFaqBody({ published: true, items: [] }, "store", secrets),
      parseFaqBody(
        { published: true, items: [{ question: "问\n题", answer: "答案" }] },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "<b>问</b>", answer: "答案" }] },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "问", answer: "**答案**" }] },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "问", answer: "a".repeat(401) }] },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "问".repeat(81), answer: "答案" }] },
        "product",
        secrets,
      ),
      parseFaqBody(
        {
          published: true,
          items: Array.from({ length: 13 }, (_, index) => ({
            question: `问${String(index)}`,
            answer: "答案",
          })),
        },
        "store",
        secrets,
      ),
      parseFaqBody(
        {
          published: true,
          items: Array.from({ length: 9 }, (_, index) => ({
            question: `问${String(index)}`,
            answer: "答案",
          })),
        },
        "product",
        secrets,
      ),
      parseFaqBody(
        {
          published: true,
          items: [
            { question: " 重复 ", answer: "一" },
            { question: "重复", answer: "二" },
          ],
        },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "问", answer: "138-0013-8000" }] },
        "store",
        secrets,
      ),
      parseFaqBody(
        { published: true, items: [{ question: "问", answer: "owner@example.com" }] },
        "store",
        secrets,
      ),
      parseFaqBody({ published: false, items: [], extra: true }, "store", secrets),
      parseFaqBody({ published: false }, "store", secrets),
      parseFaqBody({ published: "yes", items: [] }, "store", secrets),
    ];
    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        expect(failure.error).toBe("validation_error");
        expect(failure).not.toHaveProperty("value");
      }
    }
  });
});
