import { describe, expect, it } from "vitest";
import { devicePromptPage } from "./provider";

describe("device prompt page", () => {
  it("escapes dynamic text and leaves the library form fragment intact", () => {
    const html = devicePromptPage(
      "<title>",
      `请确认短码 <img alt="x"> "quoted"`,
      `<form action="/oauth/device"><input type="hidden" name="x" value="1"></form>`,
    );
    expect(html).toContain("<title>&lt;title&gt;</title>");
    expect(html).toContain("请确认短码 &lt;img alt=&quot;x&quot;&gt; &quot;quoted&quot;");
    expect(html).toContain(
      `<form action="/oauth/device"><input type="hidden" name="x" value="1"></form>`,
    );
    expect(html).not.toContain("<img");
  });
});
