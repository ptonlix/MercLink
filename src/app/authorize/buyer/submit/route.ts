import { approveAgent } from "../../../../app-services/access/grants";
import { missingInteraction } from "../../../../app-services/access/provider";
import { getAccessProvider } from "../../../../app-services/access/runtime";
import {
  checkBuyerSms,
  completeBuyerRegistration,
  existingBuyerMustLogin,
  loginBuyerWithPassword,
  registrationAccountSession,
  requestBuyerSms,
  safeBuyerPhone,
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
import { devSmsCode, devStubsEnabled } from "../../../../shared/dev-stubs";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(buyerSubmitPage(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

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

  if (intent === "logout") {
    return redirectTo("/authorize/buyer", {
      name: accountCookie,
      value: "",
      path: "/authorize",
      clear: true,
    });
  }
  if (intent === "sms") {
    const result = await requestBuyerSms(flow, {
      phone,
      captchaVerifyParam: formValue(form, "captchaVerifyParam"),
    });
    if (!result.ok) {
      return redirectTo(buyerPath({ step: "phone", notice: result.message }));
    }
    const sent = devStubsEnabled(process.env)
      ? `本地开发验证码是 ${devSmsCode}，未发送短信。`
      : "验证码已发送。";
    return redirectTo(buyerPath({ step: "code", phone, mode: result.mode, notice: sent }));
  }
  if (intent === "check") {
    const result = await checkBuyerSms(flow, { phone, code: formValue(form, "code") });
    if (!result.ok) {
      return redirectTo(buyerPath({ step: "code", phone, notice: result.message }));
    }
    return redirectTo(
      buyerPath({ step: "password", phone, mode: result.mode, notice: "短信已核验。" }),
    );
  }
  if (intent === "register") {
    const result = await completeBuyerRegistration(flow, {
      phone,
      password: formValue(form, "password"),
      email: formValue(form, "email"),
    });
    const buyerId = registrationAccountSession(result);
    if (buyerId === null) {
      return redirectTo(registerFailurePath(phone, result));
    }
    return accountRedirect(runtime.env.OAUTH_SIGNING_SECRET, buyerId, runtime.clock.now());
  }
  if (intent === "password") {
    const result = await loginBuyerWithPassword(flow, {
      phone,
      password: formValue(form, "password"),
    });
    if (!result.ok) {
      return redirectTo(
        buyerPath({ step: "password", phone, mode: "login", notice: result.message }),
      );
    }
    return accountRedirect(runtime.env.OAUTH_SIGNING_SECRET, result.buyer.id, runtime.clock.now());
  }
  if (intent === "approve") {
    const token = readCookie(request, accountCookie);
    const session =
      token === undefined
        ? null
        : readSession(token, runtime.env.OAUTH_SIGNING_SECRET, runtime.clock.now());
    if (session === null || session.kind !== "account" || session.ownerType !== "buyer") {
      return redirectTo(buyerPath({ step: "phone", notice: "请先登录。" }));
    }
    const provider = await getAccessProvider();
    try {
      const approved = await approveAgent({
        provider,
        sql: runtime.sql,
        cookieHeader: request.headers.get("cookie") ?? "",
        page: "buyer",
        ownerType: "buyer",
        ownerId: session.ownerId,
      });
      return redirectTo(approved.returnTo);
    } catch (error: unknown) {
      if (!missingInteraction(error)) {
        throw error;
      }
      return redirectTo(
        buyerPath({
          step: "phone",
          notice: "当前没有待批准的授权请求。请从 Agent 重新发起授权。",
        }),
      );
    }
  }
  return redirectTo("/authorize/buyer");
}

function buyerSubmitPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/authorize/buyer"><title>买家授权</title></head><body><p>这是提交地址，不是页面。<a href="/authorize/buyer">回到买家登录</a></p></body></html>`;
}

function buyerPath(input: {
  step: "phone" | "code" | "password";
  notice: string;
  phone?: string;
  mode?: "login" | "register";
}): string {
  const params = new URLSearchParams();
  params.set("step", input.step);
  params.set("notice", input.notice);
  const phone = safeBuyerPhone(input.phone);
  if (phone !== "" && input.step !== "phone") {
    params.set("phone", phone);
  }
  if (input.mode !== undefined && input.step === "password") {
    params.set("mode", input.mode);
  }
  return `/authorize/buyer?${params.toString()}`;
}

function registerFailurePath(
  phone: string,
  result: { ok: true } | { ok: false; error: string; message: string },
): string {
  if (!result.ok && result.error === "conflict") {
    return buyerPath({ step: "password", phone, mode: "login", notice: result.message });
  }
  if (!result.ok) {
    return buyerPath({ step: "password", phone, mode: "register", notice: result.message });
  }
  return buyerPath({ step: "password", phone, mode: "login", notice: existingBuyerMustLogin });
}

function accountRedirect(secret: string, buyerId: string, now: Date): Response {
  return redirectTo(buyerPath({ step: "phone", notice: "登录成功，请批准。" }), {
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
