import { confirmDevPay } from "../../../../../app-services/commerce/dev-pay";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ paymentId: string }> },
): Promise<Response> {
  const { paymentId } = await context.params;
  const result = await confirmDevPay(paymentId);
  if (!result.ok) {
    if (result.status === 409) {
      return redirect(paymentId, "订单没有变为已支付。");
    }
    return new Response(null, { status: 404 });
  }
  return redirect(paymentId, "模拟支付已确认。");
}

function redirect(paymentId: string, notice: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: `/dev/pay/${paymentId}?notice=${encodeURIComponent(notice)}`,
    },
  });
}
