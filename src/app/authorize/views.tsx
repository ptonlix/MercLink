import { createElement, type ReactNode } from "react";
import { BuyerCaptcha, BuyerCaptchaBinder } from "./buyer-captcha";

function authorizeSlot(name: string): ReactNode {
  return createElement("merclink-slot", { name });
}

function authorizeNotice(template: boolean, notice: string | null): ReactNode {
  if (template) {
    return authorizeSlot("authorize.notice");
  }
  if (notice === null) {
    return null;
  }
  return (
    <p className="notice" role="alert" aria-live="polite">
      {notice}
    </p>
  );
}

export function MerchantAuthorizeView(props: {
  notice: string | null;
  mustChangePassword: boolean;
  account?: { name: string; phone: string } | null;
  template?: boolean;
}): ReactNode {
  const account = props.account ?? null;
  const template = props.template === true;
  return (
    <main className="ml-auth">
      <p className="kicker">MercLink</p>
      <h1>
        {account === null ? "店主登录" : props.mustChangePassword ? "修改初始密码" : "批准 Agent"}
      </h1>
      <p className="lede">用启动时的店主账号登录并批准 Agent。手机号和密码与管理页相同。</p>
      {authorizeNotice(template, props.notice)}
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
          {template ? (
            <p>
              当前登录 {authorizeSlot("authorize.account.name")}{" "}
              {authorizeSlot("authorize.account.phone")}
            </p>
          ) : (
            <p>
              当前登录 {account.name} {account.phone}
            </p>
          )}
          {props.mustChangePassword ? (
            <>
              <p className="hint">先修改初始密码，完成后才能批准 Agent。</p>
              <form action="/authorize/merchant/submit" method="post" className="stack">
                <input type="hidden" name="intent" value="change-password" />
                <label>
                  当前密码
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  新密码
                  <input name="nextPassword" type="password" autoComplete="new-password" required />
                </label>
                <button type="submit">修改密码</button>
              </form>
            </>
          ) : (
            <>
              <p className="hint">
                商家 Agent 可以管理目录、商品与规格，并查看店铺订单。请核对自己的授权请求后继续。
              </p>
              <form action="/authorize/merchant/submit" method="post">
                <input type="hidden" name="intent" value="approve" />
                <button type="submit">批准</button>
              </form>
            </>
          )}
        </>
      )}
      <aside className="owner-guide">
        <h2>如何上架商品</h2>
        <p>
          把<a href="/merchant/skill.md">商家 Skill</a>交给
          Agent，在浏览器登录并批准后，向它提供商品名称、价格、库存、图片和规格。Agent
          补齐必填资料并上架，商品才会出现在店铺首页。
        </p>
      </aside>
      <p className="hint">请只在自己的浏览器输入密码，不要发送给 Agent。</p>
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
  template?: boolean;
}): ReactNode {
  const devStubs = props.devStubs === true;
  const template = props.template === true;
  return (
    <main className="ml-auth">
      <p className="kicker">MercLink</p>
      <h1>{buyerHeading(props.step, props.mode)}</h1>
      <p className="lede">
        {template
          ? buyerLedeTemplate(props.step, props.mode, props.pendingApproval === true)
          : buyerLede(props.step, props.mode, props.phone, props.pendingApproval === true)}
      </p>
      {authorizeNotice(template, props.notice)}
      <ol className="auth-steps" aria-label="登录进度">
        {["验证手机号", "核验短信", "登录账号", "确认授权"].map((label, index) => (
          <li
            key={label}
            aria-current={
              ["phone", "code", "password", "approve"][index] === props.step ? "step" : undefined
            }
          >
            {label}
          </li>
        ))}
      </ol>
      {props.step === "approve" ? (
        <>
          {props.pendingApproval === true ? (
            <form action="/authorize/buyer/submit" method="post" className="stack">
              <input type="hidden" name="intent" value="approve" />
              <button type="submit">批准</button>
            </form>
          ) : null}
          <form action="/authorize/buyer/submit" method="post" className="secondary-action">
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
          {template ? (
            authorizeSlot("authorize.captcha")
          ) : devStubs ? (
            <input type="hidden" name="captchaVerifyParam" value={props.captchaToken ?? ""} />
          ) : (
            <BuyerCaptcha prefix={props.captchaPrefix} sceneId={props.captchaSceneId} />
          )}
          <p className="hint">
            {devStubs
              ? "本地开发不会发送短信。验证码填写 123456。"
              : "完成图形人机验证后再发送短信。"}
          </p>
          <button id="captcha-send" type="submit" disabled={devStubs ? undefined : true}>
            发送验证码
          </button>
        </form>
      ) : null}
      {props.step === "code" ? (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input type="hidden" name="intent" value="check" />
          <input type="hidden" name="phone" value={template ? "" : props.phone} />
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
          <input type="hidden" name="phone" value={template ? "" : props.phone} />
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
      <p className="hint">手机号、密码和验证码只在此浏览器输入，不要发送给 Agent。</p>
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

function buyerLedeTemplate(
  step: BuyerAuthorizeStep,
  mode: "login" | "register",
  pendingApproval: boolean,
): ReactNode {
  const phone = authorizeSlot("authorize.phone");
  if (step === "approve") {
    return pendingApproval ? (
      <>当前登录 {phone}。确认后，买家 Agent 可以为你下单并查询自己的订单。</>
    ) : (
      <>当前登录 {phone}。当前没有待批准的授权请求。请从 Agent 重新发起授权后再批准。</>
    );
  }
  if (step === "code") {
    return <>验证码将核验 {phone}。未注册过的手机号会在下一步创建账号。</>;
  }
  if (step === "password" && mode === "register") {
    return <>首次登录会为 {phone} 创建账号。邮箱不是登录标识。</>;
  }
  if (step === "password") {
    return <>{phone} 已注册。输入密码后即可批准。</>;
  }
  return "未注册过的手机号，首次登录即注册。邮箱不是登录标识。";
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
      ? `${who}确认后，买家 Agent 可以为你下单并查询自己的订单。`
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

export function AuthorizeAppearance(props: {
  html: string;
  injectCaptcha: boolean;
  captchaPrefix: string;
  captchaSceneId: string;
}): ReactNode {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: props.html }} />
      {props.injectCaptcha ? (
        <BuyerCaptchaBinder prefix={props.captchaPrefix} sceneId={props.captchaSceneId} />
      ) : null}
    </>
  );
}

export function AccountKeyView(props: {
  keys: readonly { id: string; prefix: string; revoked: boolean }[];
  secret: string | null;
}): ReactNode {
  return (
    <main className="ml-auth">
      <p className="kicker">脚本</p>
      <h1>API Key</h1>
      <p className="lede">只给没有浏览器的服务器脚本使用。授权页不会发放密钥。</p>
      {props.secret === null ? null : (
        <div className="secret" role="status">
          <p>新密钥只显示一次，请妥善保存：</p>
          <code>{props.secret}</code>
        </div>
      )}
      <form action="/api/v1/api-keys" method="post">
        <button type="submit">创建密钥</button>
      </form>
      {props.keys.length === 0 ? <p className="hint">尚未创建脚本密钥。</p> : null}
      <ul className="key-list">
        {props.keys.map((key) => (
          <li key={key.id}>
            <span>{key.prefix}</span>
            {key.revoked ? <span>已撤销</span> : <span>有效</span>}
            {key.revoked ? null : (
              <form
                action={`/api/v1/api-keys/${key.id}`}
                method="post"
                className="secondary-action"
              >
                <input type="hidden" name="_method" value="delete" />
                <button type="submit">撤销</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

export function AdminView(props: {
  notice: string | null;
  next?: string | null;
  voluntary?: boolean;
}): ReactNode {
  return (
    <main className="ml-auth">
      <p className="kicker">管理</p>
      <h1>{props.voluntary === true ? "修改店主密码" : "修改初始密码"}</h1>
      <p className="lede">
        这一套部署只有一家店。这个账号就是店主，用同一手机号和密码到商家授权页批准
        Agent。默认目录已经建好。
      </p>
      {props.notice === null ? null : (
        <p className="notice" role="alert" aria-live="polite">
          {props.notice}
        </p>
      )}
      <form action="/admin/submit" method="post" className="stack">
        <input type="hidden" name="intent" value="password" />
        {props.voluntary === true ? <input type="hidden" name="change" value="1" /> : null}
        {props.next == null || props.next === "" ? null : (
          <input type="hidden" name="next" value={props.next} />
        )}
        <label>
          当前密码
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>
          新密码
          <input name="nextPassword" type="password" autoComplete="new-password" required />
        </label>
        <button type="submit">修改密码</button>
      </form>
    </main>
  );
}

export function AdminSettledView(props: { notice: string | null }): ReactNode {
  return (
    <main className="ml-auth">
      <p className="kicker">管理</p>
      <h1>已登录</h1>
      <p className="lede">店主密码已经修改，这里不再要求改密。</p>
      {props.notice === null ? null : (
        <p className="notice" role="alert" aria-live="polite">
          {props.notice}
        </p>
      )}
      <p>
        <a href="/admin?change=1">仍要修改密码</a>
      </p>
    </main>
  );
}

export function AdminLoginView({
  notice,
  next,
}: {
  notice: string | null;
  next?: string | null;
}): ReactNode {
  return (
    <main className="ml-auth">
      <p className="kicker">MercLink</p>
      <h1>店主登录</h1>
      <p className="lede">用店主手机号登录。只有尚未修改初始密码时，才会进入改密页。</p>
      {notice === null ? null : (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      <form action="/admin/submit" method="post" className="stack">
        <input type="hidden" name="intent" value="login" />
        {next == null || next === "" ? null : <input type="hidden" name="next" value={next} />}
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
    </main>
  );
}
