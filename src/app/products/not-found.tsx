/* eslint-disable @next/next/no-html-link-for-pages -- The recovery link must also work without JavaScript. */
import type { ReactNode } from "react";
import { slotStoreFromPublic } from "../../public-discovery/documents";
import { PublicShell } from "../../public-discovery/views";
import { publicStore } from "../../shared/seams/public-store";

export default async function ProductNotFound(): Promise<ReactNode> {
  const store = await publicStore.get();
  return (
    <PublicShell
      facts={{
        store: slotStoreFromPublic(store),
        products: [],
        product: null,
        orderStatus: null,
        nextCursor: null,
      }}
    >
      <h1>没有找到商品</h1>
      <p className="empty">商品可能已下架或不可公开访问，请查看其他已上架商品。</p>
      <a className="returnLink" href="/products">
        返回商品列表
      </a>
    </PublicShell>
  );
}
