/* eslint-disable @next/next/no-html-link-for-pages -- The recovery link must also work without JavaScript. */
import type { ReactNode } from "react";

export default function ProductNotFound(): ReactNode {
  return (
    <main className="page">
      <div className="column">
        <h1>没有找到商品</h1>
        <p className="empty">商品可能已下架或不可公开访问，请查看其他已上架商品。</p>
        <a className="returnLink" href="/products">
          返回商品列表
        </a>
      </div>
    </main>
  );
}
