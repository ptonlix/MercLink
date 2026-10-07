import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { readDevPay } from "../../../../app-services/commerce/dev-pay";
import "../../../authorize/authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "模拟支付" };

export default async function DevPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ notice?: string }>;
}): Promise<ReactNode> {
  const [{ paymentId }, query] = await Promise.all([params, searchParams]);
  const view = await readDevPay(paymentId);
  if (!view.ok) {
    notFound();
  }
  return (
    <main className="sheet">
      <p className="kicker">MercLink</p>
      <h1>模拟支付</h1>
      <p className="lede">这是本地开发支付，不会调用支付宝。确认后订单才变为已支付。</p>
      {query.notice === undefined ? null : <p className="notice">{query.notice}</p>}
      <p>
        {view.subject} · {formatYuan(view.amount)} {view.currency}
      </p>
      <p>当前状态：{statusLabel(view.status)}</p>
      {view.status === "pending" ? (
        <form action={`/dev/pay/${view.paymentId}/confirm`} method="post">
          <button type="submit">确认支付成功</button>
        </form>
      ) : null}
    </main>
  );
}

function formatYuan(amount: number): string {
  const whole = Math.trunc(amount / 100);
  const fraction = String(Math.abs(amount % 100)).padStart(2, "0");
  return `${String(whole)}.${fraction}`;
}

function statusLabel(status: string): string {
  if (status === "paid") {
    return "已支付";
  }
  if (status === "closed") {
    return "已关闭";
  }
  return "待支付";
}
