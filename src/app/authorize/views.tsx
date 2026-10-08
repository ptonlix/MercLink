import type { ReactNode } from "react";
import { BuyerCaptcha } from "./buyer-captcha";

export function MerchantAuthorizeView(props: {
  notice: string | null;
  mustChangePassword: boolean;
  account?: { name: string; phone: string } | null;
}): ReactNode {
  const account = props.account ?? null;
  return (
    <main className="sheet">
      <p className="kicker">MercLink</p>
      <h1>{account === null ? "店主登录" : "批准 Agent"}</h1>
      <p className="lede">
        用启动时的店主账号登录并批准 Agent。手机号和密码与管理页相同。这里不能新建账号。
      </p>
      {props.notice === null ? null : <p className="notice">{props.notice}</p>}
      {account === null ? (
        <form action="/authorize/merchant/submit" method="post" className="stack">
          <label>
            手机号
            <input name="phone" inputMode="numeric" autoComplete="username" required />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">登录</button>
        </form>
      ) : (
        <>
          <p>
            当前登录 {account.name} {account.phone}
          </p>
          {props.mustChangePassword ? (
            <form action="/authorize/merchant/submit" method="post" className="stack">
              <input type="hidden" name="intent" value="change-password" />
              <label>
                当前密码
                <input name="currentPassword" type="password" required />
              </label>
              <label>
                新密码
                <input name="nextPassword" type="password" required />
              </label>
              <button type="submit">修改密码</button>
            </form>
          ) : null}
          <form action="/authorize/merchant/submit" method="post">
            <input type="hidden" name="intent" value="approve" />
            <button type="submit">批准</button>
          </form>
        </>
      )}
    </main>
  );
}

export type BuyerAuthorizeStep = "phone" | "code" | "password" | "approve";

export function BuyerAuthorizeView(props: {
  notice: string | null;
  step: BuyerAuthorizeStep;
  mode: "login" | "register";
  phone: string;
  pendingApproval?: boolean;
  captchaPrefix: string;
  captchaSceneId: string;
  devStubs?: boolean;
  captchaToken?: string;
}): ReactNode {
  const devStubs = props.devStubs === true;
  return (
    <main className="sheet">
      <p className="kicker">MercLink</p>
      <h1>{buyerHeading(props.step, props.mode)}</h1>
      <p className="lede">
        {buyerLede(props.step, props.mode, props.phone, props.pendingApproval === true)}
      </p>
      {props.notice === null ? null : <p className="notice">{props.notice}</p>}
      {props.step === "approve" ? (
        <>
          {props.pendingApproval === true ? (
            <form action="/authorize/buyer/submit" method="post" className="stack">
              <input type="hidden" name="intent" value="approve" />
              <button type="submit">批准</button>
            </form>
          ) : null}
          <form action="/authorize/buyer/submit" method="post">
            <input type="hidden" name="intent" value="logout" />
            <button type="submit">退出登录</button>
          </form>
        </>
      ) : null}
      {props.step === "phone" ? (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input type="hidden" name="intent" value="sms" />
          <label>
            手机号
            <input name="phone" inputMode="numeric" autoComplete="username" required />
          </label>
          {devStubs ? (
            <input type="hidden" name="captchaVerifyParam" value={props.captchaToken ?? ""} />
          ) : (
            <BuyerCaptcha prefix={props.captchaPrefix} sceneId={props.captchaSceneId} />
          )}
          <p className="hint">
            {devStubs
              ? "本地开发不会发送短信。验证码填写 123456。"
              : "完成图形人机验证后再发送短信。验证参数由验证码组件回填，不要手改。"}
          </p>
          <button id="captcha-send" type="submit" disabled={devStubs ? undefined : true}>
            发送验证码
          </button>
        </form>
      ) : null}
      {props.step === "code" ? (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input type="hidden" name="intent" value="check" />
          <input type="hidden" name="phone" value={props.phone} />
          <label>
            短信验证码
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <button type="submit">核验短信</button>
          <a className="back" href="/authorize/buyer">
            换个手机号
          </a>
        </form>
      ) : null}
      {props.step === "password" ? (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input
            type="hidden"
            name="intent"
            value={props.mode === "register" ? "register" : "password"}
          />
          <input type="hidden" name="phone" value={props.phone} />
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete={props.mode === "register" ? "new-password" : "current-password"}
              required
            />
          </label>
          {props.mode === "register" ? (
            <label>
              邮箱（可选）
              <input name="email" type="email" autoComplete="email" />
            </label>
          ) : null}
          <button type="submit">{props.mode === "register" ? "设置密码并登录" : "登录"}</button>
          <a className="back" href="/authorize/buyer">
            换个手机号
          </a>
        </form>
      ) : null}
    </main>
  );
}

function buyerHeading(step: BuyerAuthorizeStep, mode: "login" | "register"): string {
  if (step === "approve") {
    return "批准 Agent";
  }
  if (step === "code") {
    return "填写验证码";
  }
  if (step === "password") {
    return mode === "register" ? "设置登录密码" : "输入密码";
  }
  return "买家登录";
}

function buyerLede(
  step: BuyerAuthorizeStep,
  mode: "login" | "register",
  phone: string,
  pendingApproval: boolean,
): string {
  if (step === "approve") {
    const who = `当前登录 ${phone}。`;
    return pendingApproval
      ? `${who}确认后，这个 Agent 可以代表你访问已授权的范围。`
      : `${who}当前没有待批准的授权请求。请从 Agent 重新发起授权后再批准。`;
  }
  if (step === "code") {
    return `验证码将核验 ${phone}。未注册过的手机号会在下一步创建账号。`;
  }
  if (step === "password" && mode === "register") {
    return `首次登录会为 ${phone} 创建账号。邮箱不是登录标识。`;
  }
  if (step === "password") {
    return `${phone} 已注册。输入密码后即可批准。`;
  }
  return "未注册过的手机号，首次登录即注册。邮箱不是登录标识。";
}

export function AccountKeyView(props: {
  keys: readonly { id: string; prefix: string; revoked: boolean }[];
  secret: string | null;
}): ReactNode {
  return (
    <main className="sheet">
      <p className="kicker">脚本</p>
      <h1>API Key</h1>
      <p className="lede">只给没有浏览器的服务器脚本使用。授权页不会发放密钥。</p>
      {props.secret === null ? null : <p className="secret">新密钥只显示一次：{props.secret}</p>}
      <form action="/api/v1/api-keys" method="post">
        <button type="submit">创建密钥</button>
      </form>
      <ul>
        {props.keys.map((key) => (
          <li key={key.id}>
            <span>{key.prefix}</span>
            {key.revoked ? <span>已撤销</span> : <span>有效</span>}
            <form action={`/api/v1/api-keys/${key.id}`} method="post">
              <input type="hidden" name="_method" value="delete" />
              <button type="submit">撤销</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function AdminView(props: { notice: string | null }): ReactNode {
  return (
    <main className="sheet">
      <p className="kicker">管理</p>
      <h1>店主</h1>
      <p className="lede">
        这一套部署只有一家店。这个账号就是店主，用同一手机号和密码到商家授权页批准
        Agent。默认目录已经建好。
      </p>
      {props.notice === null ? null : <p className="notice">{props.notice}</p>}
      <form action="/admin/submit" method="post" className="stack">
        <input type="hidden" name="intent" value="password" />
        <label>
          当前密码
          <input name="currentPassword" type="password" required />
        </label>
        <label>
          新密码
          <input name="nextPassword" type="password" required />
        </label>
        <button type="submit">修改密码</button>
      </form>
    </main>
  );
}
