import { approveAgent } from "../../../../app-services/access/grants";
import { getAccessProvider } from "../../../../app-services/access/runtime";
import {
  checkBuyerSms,
  completeBuyerRegistration,
  loginBuyerWithPassword,
  requestBuyerSms,
} from "../../../../app-services/identity/buyers";
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
  const flow = {
    sql: runtime.sql,
    clock: runtime.clock,
    captcha: runtime.captcha,
    sms: runtime.sms,
    rateLimit: runtime.rateLimit,
  };
  const form = await request.formData();
  const intent = formValue(form, "intent");
  const phone = formValue(form, "phone");

  if (intent === "sms") {
    const result = await requestBuyerSms(flow, {
      phone,
      captchaVerifyParam: formValue(form, "captchaVerifyParam"),
    });
    if (!result.ok) {
      return redirectTo(`/authorize/buyer?notice=${encodeURIComponent(result.message)}`);
    }
    return redirectTo(
      `/authorize/buyer?mode=${result.mode}&notice=${encodeURIComponent("验证码已发送。")}`,
    );
  }
  if (intent === "check") {
    const result = await checkBuyerSms(flow, { phone, code: formValue(form, "code") });
    if (!result.ok) {
      return redirectTo(`/authorize/buyer?notice=${encodeURIComponent(result.message)}`);
    }
    return redirectTo(
      `/authorize/buyer?mode=${result.mode}&notice=${encodeURIComponent("短信已核验。")}`,
    );
  }
  if (intent === "register") {
    const result = await completeBuyerRegistration(flow, {
      phone,
      password: formValue(form, "password"),
      email: formValue(form, "email"),
    });
    if (!result.ok) {
      return redirectTo(`/authorize/buyer?notice=${encodeURIComponent(result.message)}`);
    }
    return accountRedirect(
      runtime.env.OAUTH_SIGNING_SECRET,
      result.buyerId,
      runtime.clock.now(),
      result.mode,
    );
  }
  if (intent === "password") {
    const result = await loginBuyerWithPassword(flow, {
      phone,
      password: formValue(form, "password"),
    });
    if (!result.ok) {
      return redirectTo(`/authorize/buyer?mode=login&notice=${encodeURIComponent(result.message)}`);
    }
    return accountRedirect(
      runtime.env.OAUTH_SIGNING_SECRET,
      result.buyer.id,
      runtime.clock.now(),
      "login",
    );
  }
  if (intent === "approve") {
    const token = readCookie(request, accountCookie);
    const session =
      token === undefined
        ? null
        : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
    if (session === null || session.kind !== "account" || session.ownerType !== "buyer") {
      return redirectTo("/authorize/buyer?notice=" + encodeURIComponent("请先登录。"));
    }
    const provider = await getAccessProvider();
    const approved = await approveAgent({
      provider,
      sql: runtime.sql,
      cookieHeader: request.headers.get("cookie") ?? "",
      page: "buyer",
      ownerType: "buyer",
      ownerId: session.ownerId,
    });
    return redirectTo(approved.returnTo);
  }
  return redirectTo("/authorize/buyer");
}

function accountRedirect(
  secret: string,
  buyerId: string,
  now: Date,
  mode: "login" | "register",
): Response {
  return redirectTo(`/authorize/buyer?mode=${mode}`, {
    name: accountCookie,
    value: signSession(
      {
        kind: "account",
        ownerType: "buyer",
        ownerId: buyerId,
        exp: Math.floor(now.getTime() / 1000) + sessionTtlSeconds,
      },
      secret,
    ),
    path: "/authorize",
  });
}
