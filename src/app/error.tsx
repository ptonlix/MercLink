"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Recovery navigation also works without the client router. */
import type { ReactNode } from "react";

export default function PageError({ reset }: { reset: () => void }): ReactNode {
  return (
    <main className="page">
      <div className="column">
        <h1>页面暂时无法加载</h1>
        <div className="empty" role="alert">
          <p>数据查询失败，请稍后重试。</p>
          <p>这不代表店铺没有商品。</p>
        </div>
        <div className="pagination">
          <button className="button" type="button" onClick={reset}>
            重新加载
          </button>
        </div>
        <a className="returnLink" href="/">
          返回店铺首页
        </a>
      </div>
    </main>
  );
}
