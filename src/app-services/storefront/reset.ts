import { resetExecutionAllowed, type ResetActor } from "../../domain/storefront/reset";
import {
  storefrontFail,
  storefrontOk,
  type StorefrontResult,
} from "../../domain/storefront/result";
import { createPublicId } from "../../shared/id";
import { absoluteUrl } from "../../public-discovery/site";
import { storefrontRuntime } from "./runtime";
import type { PointerRow, ResetRequestRow } from "./store";

export type ResetRequestView = {
  id: string;
  status: ResetRequestRow["status"];
  approvalUrl: string;
};

export async function requestStorefrontReset(
  merchantId: string,
): Promise<StorefrontResult<ResetRequestView>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "重置暂时不可用。");
  }
  const request: ResetRequestRow = {
    id: createPublicId("reset"),
    merchantId,
    status: "pending",
    createdAt: runtime.clock.now(),
    decidedAt: null,
  };
  await runtime.store.insertResetRequest(request);
  return storefrontOk(view(request));
}

export async function readStorefrontReset(id: string): Promise<StorefrontResult<ResetRequestView>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "重置暂时不可用。");
  }
  const request = await runtime.store.getResetRequest(id);
  if (request === null) {
    return storefrontFail("not_found", "没有找到重置请求。");
  }
  return storefrontOk(view(request));
}

export async function executeStorefrontReset(
  id: string,
  actor: ResetActor,
): Promise<StorefrontResult<ResetRequestView>> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return storefrontFail("dependency_unavailable", "重置暂时不可用。");
  }
  const request = await runtime.store.getResetRequest(id);
  if (request === null) {
    return storefrontFail("not_found", "没有找到重置请求。");
  }
  if (!resetExecutionAllowed(request.status, actor)) {
    return storefrontFail("forbidden", "重置必须由已登录的管理员批准后才能执行。");
  }
  const before = await runtime.store.readPointer();
  const keys = await runtime.store.listObjectKeys();
  for (const key of keys) {
    try {
      await runtime.objectStorage.delete(key);
    } catch {
      return storefrontFail("dependency_unavailable", "重置暂时不可用。");
    }
  }
  const decidedAt = runtime.clock.now();
  let committed = false;
  try {
    committed = await runtime.store.commitResetExecution(id, decidedAt);
  } catch {
    return storefrontFail("dependency_unavailable", "重置暂时不可用。");
  }
  if (!committed) {
    return storefrontFail("forbidden", "重置必须由已登录的管理员批准后才能执行。");
  }
  const executed = await runtime.store.getResetRequest(id);
  const pointer = await runtime.store.readPointer();
  if (
    executed === null ||
    executed.status !== "executed" ||
    pointerReferences(pointer, before.activeId) ||
    pointerReferences(pointer, before.previousId)
  ) {
    return storefrontFail("dependency_unavailable", "重置暂时不可用。");
  }
  return storefrontOk(view(executed));
}

function pointerReferences(pointer: PointerRow, releaseId: string | null): boolean {
  if (releaseId === null) {
    return false;
  }
  return pointer.activeId === releaseId || pointer.previousId === releaseId;
}

function view(request: ResetRequestRow): ResetRequestView {
  return {
    id: request.id,
    status: request.status,
    approvalUrl: absoluteUrl(`/admin/storefront-resets/${request.id}`),
  };
}
