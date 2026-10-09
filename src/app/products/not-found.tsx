/* eslint-disable @next/next/no-html-link-for-pages -- The recovery link must also work without JavaScript. */
import type { ReactNode } from "react";
import styles from "../../public-discovery/public.module.css";

export default function ProductNotFound(): ReactNode {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <h1>没有找到商品</h1>
        <p className={styles.empty}>商品可能已下架或不可公开访问，请查看其他已上架商品。</p>
        <a className={styles.returnLink} href="/products">
          返回商品列表
        </a>
      </div>
    </main>
  );
}
