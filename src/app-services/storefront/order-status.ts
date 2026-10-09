import { readBuyerOrder } from "../commerce/read-order";
import { commerceRuntime } from "../commerce/runtime";
import { authenticate } from "../../shared/seams/authenticate";

export async function readStorefrontOrderStatus(input: {
  request: Request;
  orderId: string;
}): Promise<string | null> {
  const auth = await authenticate(input.request);
  if (!auth.ok) {
    return null;
  }
  try {
    const result = await readBuyerOrder({
      actor: auth.actor,
      orderId: input.orderId,
      runtime: commerceRuntime(),
    });
    return result.ok ? result.graph.order.status : null;
  } catch {
    return null;
  }
}
