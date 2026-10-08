import type { PaymentChannel } from "../../ports/payment";

export const alipayGateway = "https://openapi.alipay.com/gateway.do";

export const alipayMethods = {
  create: "alipay.trade.page.pay",
  createMobile: "alipay.trade.wap.pay",
  query: "alipay.trade.query",
  close: "alipay.trade.close",
} as const;

const productCodes = {
  desktop: "FAST_INSTANT_TRADE_PAY",
  mobile: "QUICK_WAP_WAY",
} as const satisfies Record<PaymentChannel, string>;

function yuanFromMinor(amount: number): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }
  const whole = Math.trunc(amount / 100);
  const fraction = String(Math.abs(amount % 100)).padStart(2, "0");
  return `${String(whole)}.${fraction}`;
}

function sanitizeSubject(subject: string): string {
  const cleaned = subject.replace(/[/=&]/g, "").replace(/\s+/g, " ").trim();
  const limited = cleaned.slice(0, 256);
  return limited.length > 0 ? limited : "order";
}

export function pagePayBizContent(input: {
  paymentId: string;
  amount: number;
  subject: string;
  channel: PaymentChannel;
}): string | null {
  const totalAmount = yuanFromMinor(input.amount);
  if (totalAmount === null) {
    return null;
  }
  return JSON.stringify({
    out_trade_no: input.paymentId,
    total_amount: totalAmount,
    subject: sanitizeSubject(input.subject),
    product_code: productCodes[input.channel],
  });
}

export function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    record[key] = value;
  }
  return record;
}
