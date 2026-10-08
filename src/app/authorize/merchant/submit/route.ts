import { getAccessProvider } from "../../../../app-services/access/runtime";
import { approveAgent } from "../../../../app-services/access/grants";
import { missingInteraction } from "../../../../app-services/access/provider";
import {
  changeMerchantPassword,
  loginMerchant,
  merchantApprovalAllowed,
  unknownMerchantCopy,
} from "../../../../app-services/identity/merchants";
import {
  appRuntime,
  formValue,
  readCookie,
  redirectTo,
} from "../../../../app-services/identity/runtime";
import {
  accountCookie,
  readSession,
  sessionTtlSeconds,
  signSession,
} from "../../../../app-services/identity/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = appRuntime();
  const form = await request.formData();
  const intent = formValue(form, "intent");
  const token = readCookie(request, accountCookie);
  const session =
    token === undefined
      ? null
      : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());

  if (intent === "" || intent === "login") {
    const result = await loginMerchant(runtime.sql, {
      phone: formValue(form, "phone"),
      password: formValue(form, "password"),
    });
    if (!result.ok) {
      const notice =
        result.message === unknownMerchantCopy() ? unknownMerchantCopy() : result.message;
      return redirectTo(`/authorize/merchant?notice=${encodeURIComponent(notice)}`);
    }
    return redirectTo("/authorize/merchant", {
      name: accountCookie,
      value: signSession(
        {
          kind: "account",
          ownerType: "merchant",
          ownerId: result.merchant.id,
          exp: Math.floor(runtime.clock.now().getTime() / 1000) + sessionTtlSeconds,
        },
        runtime.env.OAUTH_SIGNING_SECRET,
      ),
      path: "/authorize",
    });
  }

  if (session === null || session.kind !== "account" || session.ownerType !== "merchant") {
    return redirectTo(`/authorize/merchant?notice=${encodeURIComponent(unknownMerchantCopy())}`);
  }

  if (intent === "change-password") {
    const result = await changeMerchantPassword(runtime.sql, {
      merchantId: session.ownerId,
      currentPassword: formValue(form, "currentPassword"),
      nextPassword: formValue(form, "nextPassword"),
    });
    return redirectTo(
      `/authorize/merchant?notice=${encodeURIComponent(result.ok ? "密码已修改。" : result.message)}`,
    );
  }

  if (intent === "approve") {
    const { findMerchant } = await import("../../../../app-services/identity/merchants");
    const merchant = await findMerchant(runtime.sql, session.ownerId);
    if (merchant === null) {
      return redirectTo(`/authorize/merchant?notice=${encodeURIComponent(unknownMerchantCopy())}`);
    }
    const allowed = merchantApprovalAllowed(merchant);
    if (!allowed.ok) {
      return redirectTo(`/authorize/merchant?notice=${encodeURIComponent(allowed.message)}`);
    }
    const provider = await getAccessProvider();
    try {
      const approved = await approveAgent({
        provider,
        sql: runtime.sql,
        cookieHeader: request.headers.get("cookie") ?? "",
        page: "merchant",
        ownerType: "merchant",
        ownerId: merchant.id,
      });
      return redirectTo(approved.returnTo);
    } catch (error: unknown) {
      if (!missingInteraction(error)) {
        throw error;
      }
      return redirectTo(
        `/authorize/merchant?notice=${encodeURIComponent("当前没有待批准的授权请求。请从 Agent 重新发起授权。")}`,
      );
    }
  }

  return redirectTo("/authorize/merchant");
}
