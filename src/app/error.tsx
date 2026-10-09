"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Recovery navigation also works without the client router. */
import type { ReactNode } from "react";
import styles from "../public-discovery/public.module.css";

export default function PageError({ reset }: { reset: () => void }): ReactNode {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1>页面暂时无法加载</h1>
        <div className={styles.empty} role="alert">
          <p>数据查询失败，请稍后重试。</p>
          <p>这不代表店铺没有商品。</p>
        </div>
        <div className={styles.pagination}>
          <button className={styles.button} type="button" onClick={reset}>
            重新加载
          </button>
        </div>
        <a className={styles.returnLink} href="/">
          返回店铺首页
        </a>
      </div>
    </main>
  );
}
