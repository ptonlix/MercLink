import { afterEach, describe, expect, it } from "vitest";
import { appBaseUsesHttps, redirectTo } from "./runtime";

describe("authorize session cookies", () => {
  const previous = process.env.APP_BASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previous;
    }
  });

  it("sets Secure only when the app base URL is https", () => {
    process.env.APP_BASE_URL = "http://127.0.0.1:3000";
    const local = redirectTo("/authorize/buyer", {
      name: "ml_account",
      value: "token",
      path: "/authorize",
    });
    expect(local.headers.get("set-cookie")).toBe(
      "ml_account=token; Path=/authorize; HttpOnly; SameSite=Lax",
    );
    expect(appBaseUsesHttps("http://127.0.0.1:3000")).toBe(false);

    process.env.APP_BASE_URL = "https://merclink.example";
    const hosted = redirectTo("/authorize/buyer", {
      name: "ml_account",
      value: "token",
      path: "/authorize",
    });
    expect(hosted.headers.get("set-cookie")).toContain("Secure");
    expect(hosted.headers.get("set-cookie")).toContain("Path=/authorize");
    expect(appBaseUsesHttps("https://merclink.example")).toBe(true);

    const cleared = redirectTo("/authorize/buyer", {
      name: "ml_account",
      value: "",
      path: "/authorize",
      clear: true,
    });
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(cleared.headers.get("set-cookie")).toContain("Path=/authorize");
    expect(cleared.headers.get("set-cookie")).toContain("Secure");
  });
});
