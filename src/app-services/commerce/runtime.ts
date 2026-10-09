import { createAlipayPaymentPort } from "../../adapters/alipay";
import { createDevEasyPayPort } from "../../adapters/dev/easypay";
import { createDevPaymentPort } from "../../adapters/dev/payment";
import { createEasyPayPaymentPort, readEasyPayConfig } from "../../adapters/easypay";
import { getDatabase } from "../../db/client";
import { systemClock, type Clock } from "../../ports/clock";
import type { PaymentPort, PaymentRefundPort } from "../../ports/payment";
import { devStubsEnabled } from "../../shared/dev-stubs";
import { loadEnv } from "../../shared/env";
import { isPaymentProvider, type PaymentProviderName } from "../../domain/commerce/order";
import { createDrizzleCommerceRepository } from "./drizzle-store";
import type { CommerceRepository } from "./repository";

type CatalogOwnership = (merchantId: string) => Promise<readonly string[]> | readonly string[];

type PaymentRegistry = {
  portFor(provider: string): PaymentPort | null;
  refundFor(provider: string): PaymentRefundPort | null;
};

export type CommerceRuntime = {
  repo: CommerceRepository;
  payment: PaymentPort;
  payments?: PaymentRegistry;
  startupProvider?: PaymentProviderName;
  startupReady?: boolean;
  clock: Clock;
  ownedCatalogs: CatalogOwnership;
};

export function paymentPortFor(runtime: CommerceRuntime, provider: string): PaymentPort | null {
  if (runtime.payments !== undefined) {
    return runtime.payments.portFor(provider);
  }
  return runtime.payment;
}

export function paymentRefundFor(
  runtime: CommerceRuntime,
  provider: string,
): PaymentRefundPort | null {
  return runtime.payments?.refundFor(provider) ?? null;
}

export function startupProviderOf(runtime: CommerceRuntime): PaymentProviderName {
  return runtime.startupProvider ?? "alipay";
}

export function startupProviderReady(runtime: CommerceRuntime): boolean {
  return runtime.startupReady ?? true;
}

function readStartupPaymentProvider(
  source: Readonly<Record<string, string | undefined>>,
): PaymentProviderName | null {
  const value = source.MERCLINK_PAYMENT_PROVIDER;
  if (value === undefined || value.trim() === "") {
    return "alipay";
  }
  return isPaymentProvider(value) ? value : null;
}

let override: CommerceRuntime | undefined;
let cached: CommerceRuntime | undefined;
let ownership: CatalogOwnership = () => [];

export function registerCatalogOwnership(fn: CatalogOwnership): void {
  ownership = fn;
}

export function resetCatalogOwnership(): void {
  ownership = () => [];
}

export function useCommerceRuntime(runtime: CommerceRuntime): void {
  override = runtime;
}

export function resetCommerceRuntime(): void {
  override = undefined;
  cached = undefined;
}

export function commerceRuntime(): CommerceRuntime {
  if (override !== undefined) {
    return override;
  }
  cached ??= createProductionRuntime();
  return cached;
}

function createProductionRuntime(): CommerceRuntime {
  const loaded = loadEnv(process.env);
  if (!loaded.ok) {
    throw new Error(loaded.message);
  }
  const stubs = devStubsEnabled(process.env);
  const startupProvider = readStartupPaymentProvider(process.env);
  const alipay = stubs
    ? createDevPaymentPort({
        appBaseUrl: loaded.env.APP_BASE_URL,
        signingSecret: loaded.env.OAUTH_SIGNING_SECRET,
      })
    : alipayConfigured(process.env)
      ? createAlipayPaymentPort({
          appId: loaded.env.ALIPAY_APP_ID,
          privateKey: loaded.env.ALIPAY_PRIVATE_KEY,
          alipayPublicKey: loaded.env.ALIPAY_PUBLIC_KEY,
          notifyUrl: loaded.env.ALIPAY_NOTIFY_URL,
          product: process.env.ALIPAY_PRODUCT === "alipayplus" ? "alipayplus" : "domestic",
        })
      : unavailablePayment("supported");
  const easypay = stubs
    ? createDevEasyPayPort({
        appBaseUrl: loaded.env.APP_BASE_URL,
        signingSecret: loaded.env.OAUTH_SIGNING_SECRET,
      })
    : createConfiguredEasyPay(process.env);
  const payments = createRegistry(alipay, easypay);
  const startupReady = startupProvider !== null && payments.portFor(startupProvider) !== null;
  return {
    repo: createDrizzleCommerceRepository(getDatabase(loaded.env.DATABASE_URL).db),
    payment: (startupProvider === null ? null : payments.portFor(startupProvider)) ?? alipay,
    payments,
    startupProvider: startupProvider ?? "alipay",
    startupReady,
    clock: systemClock,
    ownedCatalogs: (merchantId) => ownership(merchantId),
  };
}

function alipayConfigured(source: Readonly<Record<string, string | undefined>>): boolean {
  return [
    source.ALIPAY_APP_ID,
    source.ALIPAY_PRIVATE_KEY,
    source.ALIPAY_PUBLIC_KEY,
    source.ALIPAY_NOTIFY_URL,
  ].every((value) => value !== undefined && value.trim() !== "" && value !== "dev-unused");
}

function unavailablePayment(upstreamClose: "supported" | "unsupported"): PaymentPort {
  return {
    upstreamClose,
    createPayment: () =>
      Promise.resolve({
        ok: false,
        error: "payment_retryable",
        message: "支付网关不可用。",
      }),
    queryPayment: () =>
      Promise.resolve({
        ok: false,
        error: "dependency_unavailable",
        message: "支付网关不可用。",
      }),
    cancelPayment: () =>
      Promise.resolve({
        ok: false,
        outcome: "retryable",
        error: "payment_retryable",
        message: "支付取消失败，请重试。",
      }),
    verifyNotification: () =>
      Promise.resolve({
        ok: false,
        error: "invalid_signature",
        message: "通知验签失败。",
      }),
  };
}

function createConfiguredEasyPay(
  source: Readonly<Record<string, string | undefined>>,
): (PaymentPort & PaymentRefundPort) | null {
  const config = readEasyPayConfig(source);
  return config === null ? null : createEasyPayPaymentPort(config);
}

function createRegistry(
  alipay: PaymentPort,
  easypay: (PaymentPort & PaymentRefundPort) | null,
): PaymentRegistry {
  return {
    portFor(provider) {
      if (provider === "alipay") {
        return alipay;
      }
      if (provider === "easypay") {
        return easypay;
      }
      return null;
    },
    refundFor(provider) {
      if (provider === "easypay") {
        return easypay;
      }
      return {
        refundPayment: () => Promise.resolve({ ok: false, outcome: "unsupported" }),
      };
    },
  };
}
