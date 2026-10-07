import { describe, expect, it } from "vitest";
import { createDevPaymentPort, resetDevPayments } from "../../adapters/dev/payment";
import { devStubFlag } from "../../shared/dev-stubs";
import { requiredEnvKeys } from "../../shared/env";
import { confirmDevPay } from "./dev-pay";
import { createMemoryCommerceRepository } from "./memory-store";
import type { CommerceRuntime } from "./runtime";
import type { StoredGraph } from "./repository";

function source(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(requiredEnvKeys.map((key) => [key, `value-${key}`])),
    NODE_ENV: "development",
    [devStubFlag]: "1",
  };
}

function graph(status: "pending" | "closed"): StoredGraph {
  const now = new Date("2026-10-07T00:00:00.000Z");
  return {
    order: {
      id: "ord_dev",
      buyerId: "byr_dev",
      oauthGrantId: "grn_dev",
      clientOrderNo: "local-1",
      currency: "CNY",
      amount: 100,
      status,
      createdAt: now,
      updatedAt: now,
      paidAt: null,
      expiresAt: new Date("2026-10-07T00:30:00.000Z"),
    },
    items: [],
    payment: {
      id: "pay_dev",
      orderId: "ord_dev",
      provider: "alipay",
      providerTradeNo: "dev_pay_dev",
      status,
      amount: 100,
      currency: "CNY",
      createdAt: now,
      updatedAt: now,
      paidAt: null,
    },
  };
}

function runtime(repo: ReturnType<typeof createMemoryCommerceRepository>): CommerceRuntime {
  return {
    repo,
    payment: createDevPaymentPort({
      appBaseUrl: "http://127.0.0.1:3000",
      signingSecret: "value-OAUTH_SIGNING_SECRET",
    }),
    clock: { now: () => new Date("2026-10-07T00:05:00.000Z") },
    ownedCatalogs: () => [],
  };
}

describe("confirmDevPay", () => {
  it("does not report success or reopen a closed order", async () => {
    resetDevPayments();
    const repo = createMemoryCommerceRepository(new Map());
    await repo.transaction((unit) => unit.insertGraph(graph("closed")));

    const result = await confirmDevPay("pay_dev", runtime(repo), source());

    expect(result).toEqual({ ok: false, status: 409 });
    await expect(repo.findById("ord_dev")).resolves.toMatchObject({
      order: { status: "closed" },
      payment: { status: "closed" },
    });
  });

  it("marks a pending order paid through the notification path", async () => {
    resetDevPayments();
    const repo = createMemoryCommerceRepository(new Map());
    await repo.transaction((unit) => unit.insertGraph(graph("pending")));

    const result = await confirmDevPay("pay_dev", runtime(repo), source());

    expect(result).toEqual({ ok: true });
    await expect(repo.findById("ord_dev")).resolves.toMatchObject({
      order: { status: "paid" },
      payment: { status: "paid" },
    });
  });
});
