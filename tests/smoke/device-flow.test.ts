import { describe, expect, it } from "vitest";
import { approvalForm } from "./actors";

const baseUrl = "http://127.0.0.1:3001";

describe("device approval form", () => {
  it("prefers the approve form after the confirmation redirect lands on the authorize page", () => {
    const html = `<form action="/authorize/merchant/submit" method="post">
      <input type="hidden" name="intent" value="approve" />
      <button type="submit">批准</button>
    </form>`;
    const form = approvalForm(html, baseUrl);
    expect(form?.action).toBe("http://127.0.0.1:3001/authorize/merchant/submit");
    expect(form?.fields.get("intent")).toBe("approve");
  });

  it("keeps the device confirmation hidden fields, including confirm", () => {
    const html = `<form id="op.deviceConfirmForm" method="post" action="http://127.0.0.1:3001/oauth/device">
      <input type="hidden" name="xsrf" value="secret" />
      <input type="hidden" name="user_code" value="ABCD-EFGH" />
      <input type="hidden" name="confirm" value="yes" />
    </form>`;
    const form = approvalForm(html, baseUrl);
    expect(form?.fields.get("confirm")).toBe("yes");
    expect(form?.fields.get("user_code")).toBe("ABCD-EFGH");
  });
});
