import { closeExpiredOrders } from "../app-services/commerce/close-expired";
import { commerceRuntime } from "../app-services/commerce/runtime";

export async function runOnce(now?: Date): Promise<{ closedIds: readonly string[] }> {
  const runtime = commerceRuntime();
  return closeExpiredOrders(runtime, now ?? runtime.clock.now());
}
