import type { ReactNode } from "react";
import { BuyerCaptcha } from "./buyer-captcha";

export function MerchantAuthorizeView(props: {
  notice: string | null;
  mustChangePassword: boolean;
}): ReactNode {
  return (
    <main className="sheet">
      <p className="kicker">MercLink</p>
      <h1>商家登录</h1>
      <p className="lede">已开通的商家在这里登录并批准 Agent。没有账号时，请联系管理员开通。</p>
      {props.notice === null ? null : <p className="notice">{props.notice}</p>}
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
    </main>
  );
}

export function BuyerAuthorizeView(props: {
  notice: string | null;
  mode: "login" | "register";
  captchaPrefix: string;
  captchaSceneId: string;
}): ReactNode {
  return (
    <main className="sheet">
      <p className="kicker">MercLink</p>
      <h1>{props.mode === "register" ? "买家注册" : "买家登录"}</h1>
      <p className="lede">用手机号完成人机验证和短信核验。邮箱不是登录标识。</p>
      {props.notice === null ? null : <p className="notice">{props.notice}</p>}
      <form action="/authorize/buyer/submit" method="post" className="stack">
        <input type="hidden" name="intent" value="sms" />
        <label>
          手机号
          <input name="phone" inputMode="numeric" autoComplete="username" required />
        </label>
        <BuyerCaptcha prefix={props.captchaPrefix} sceneId={props.captchaSceneId} />
        <p className="hint">完成图形人机验证后再发送短信。验证参数由验证码组件回填，不要手改。</p>
        <button id="captcha-send" type="submit" disabled>
          发送验证码
        </button>
      </form>
      <form action="/authorize/buyer/submit" method="post" className="stack">
        <input type="hidden" name="intent" value="check" />
        <label>
          手机号
          <input name="phone" inputMode="numeric" required />
        </label>
        <label>
          短信验证码
          <input name="code" inputMode="numeric" required />
        </label>
        <button type="submit">核验短信</button>
      </form>
      {props.mode === "register" ? (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input type="hidden" name="intent" value="register" />
          <label>
            手机号
            <input name="phone" inputMode="numeric" required />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          <label>
            邮箱（可选）
            <input name="email" type="email" autoComplete="email" />
          </label>
          <button type="submit">设置密码</button>
        </form>
      ) : (
        <form action="/authorize/buyer/submit" method="post" className="stack">
          <input type="hidden" name="intent" value="password" />
          <label>
            手机号
            <input name="phone" inputMode="numeric" required />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">登录</button>
        </form>
      )}
      <form action="/authorize/buyer/submit" method="post">
        <input type="hidden" name="intent" value="approve" />
        <button type="submit">批准</button>
      </form>
    </main>
  );
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

export function AdminView(props: {
  notice: string | null;
  mustChangePassword: boolean;
}): ReactNode {
  return (
    <main className="sheet">
      <p className="kicker">管理</p>
      <h1>超级管理员</h1>
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
      {props.mustChangePassword ? null : (
        <>
          <form action="/admin/submit" method="post" className="stack">
            <input type="hidden" name="intent" value="provision" />
            <label>
              商家名称
              <input name="name" required />
            </label>
            <label>
              手机号
              <input name="phone" inputMode="numeric" required />
            </label>
            <label>
              初始密码
              <input name="password" type="password" required />
            </label>
            <button type="submit">开通商家</button>
          </form>
          <form action="/admin/submit" method="post" className="stack">
            <input type="hidden" name="intent" value="disable" />
            <label>
              商家编号
              <input name="merchantId" required />
            </label>
            <button type="submit">停用商家</button>
          </form>
          <form action="/admin/submit" method="post" className="stack">
            <input type="hidden" name="intent" value="reset" />
            <label>
              商家编号
              <input name="merchantId" required />
            </label>
            <label>
              新密码
              <input name="password" type="password" required />
            </label>
            <button type="submit">重置密码</button>
          </form>
        </>
      )}
    </main>
  );
}
