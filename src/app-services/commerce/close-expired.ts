import { restoreQuantity } from "../../domain/commerce/order";
import { sellableVariants } from "../../shared/seams/sellable-variants";
import type { CommerceRuntime } from "./runtime";

export async function closeExpiredOrders(
  runtime: CommerceRuntime,
  now: Date,
): Promise<{ closedIds: readonly string[] }> {
  const due = await runtime.repo.listExpiredPending(now);
  const closedIds: string[] = [];
  for (const order of due) {
    const closed = await runtime.repo.transaction(async (unit) => {
      const locked = await unit.lockPending(order.id, now);
      if (locked === null) {
        return null;
      }
      const marked = await unit.markClosed(order.id, now);
      if (!marked) {
        return null;
      }
      for (const item of locked.items) {
        const qty = restoreQuantity(item.variantSnapshot.stock, item.qty);
        if (qty <= 0) {
          continue;
        }
        const restored = await sellableVariants.restore({
          variantId: item.variantId,
          qty,
          tx: unit.seamTx,
        });
        if (!restored.ok) {
          throw new Error(restored.message);
        }
      }
      return locked.payment;
    });
    if (closed === null) {
      continue;
    }
    closedIds.push(order.id);
    try {
      await runtime.payment.cancelPayment({
        paymentId: closed.id,
        providerTradeNo: closed.providerTradeNo,
      });
    } catch {
      // The local close already committed. A later scan must not restore stock again.
    }
  }
  return { closedIds };
}
