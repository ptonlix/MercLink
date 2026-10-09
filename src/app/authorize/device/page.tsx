import type { ReactNode } from "react";
import "../authorize.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "设备码" };

export default function DevicePage(): ReactNode {
  return (
    <main className="ml-auth">
      <p className="kicker">MercLink</p>
      <h1>输入设备码</h1>
      <p className="lede">把 Agent 显示的短码填在这里。短码几分钟后失效。</p>
      <form action="/oauth/device" method="post" className="stack">
        <label>
          设备码
          <input
            name="user_code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            required
          />
        </label>
        <button type="submit">继续</button>
      </form>
    </main>
  );
}
