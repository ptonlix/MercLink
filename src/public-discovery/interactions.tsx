"use client";

/* eslint-disable @next/next/no-img-element -- Covers come from the existing public image endpoint and must work without the image optimization service. */
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { PublicVariant } from "../shared/seams/public-products";
import { availabilityText, displayPrice, optionText, variantStock } from "./presentation";
import styles from "./public.module.css";

const subscribe = (): (() => void) => () => undefined;
const hydratedSnapshot = (): boolean => true;
const serverSnapshot = (): boolean => false;

function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, hydratedSnapshot, serverSnapshot);
}

export function PublicImage({
  src,
  title,
  logo = false,
}: {
  src: string | null;
  title: string;
  logo?: boolean;
}): ReactNode {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    const check = (): void => {
      if (image !== null && image.complete && image.naturalWidth === 0) setFailed(true);
    };
    check();
  }, [src]);
  return (
    <span className={logo ? styles.logo : styles.cover}>
      <span className={styles.placeholder} aria-hidden={src !== null && !failed}>
        {logo ? "店铺标识" : "暂无图片"}
      </span>
      {src === null || failed ? null : (
        <img
          ref={imageRef}
          src={src}
          alt={title}
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}

export function BannerShelf({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const [bounds, setBounds] = useState({ start: true, end: true });
  useEffect(() => {
    const shelf = ref.current;
    if (shelf === null) return;
    const measure = (): void => {
      setBounds({
        start: shelf.scrollLeft <= 2,
        end: shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2,
      });
    };
    measure();
    shelf.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(shelf);
    return () => {
      observer.disconnect();
      shelf.removeEventListener("scroll", measure);
    };
  }, []);
  function scroll(direction: number): void {
    const shelf = ref.current;
    if (shelf === null) return;
    const card = shelf.firstElementChild;
    const width = card?.getBoundingClientRect().width ?? shelf.clientWidth;
    const gap = Number.parseFloat(getComputedStyle(shelf).columnGap) || 0;
    shelf.scrollBy({ left: direction * (width + gap), behavior: "auto" });
  }
  return (
    <>
      <div className={styles.sectionHeading}>
        <h2>已上架商品</h2>
        {hydrated ? (
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label="上一张"
              disabled={bounds.start}
              onClick={() => {
                scroll(-1);
              }}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="下一张"
              disabled={bounds.end}
              onClick={() => {
                scroll(1);
              }}
            >
              →
            </button>
          </div>
        ) : null}
      </div>
      <div ref={ref} className={styles.shelf} aria-label="商品 banner">
        {children}
      </div>
    </>
  );
}

export function CopyText({
  text,
  label,
  disabled = false,
}: {
  text: string;
  label: string;
  disabled?: boolean;
}): ReactNode {
  const hydrated = useHydrated();
  const [feedback, setFeedback] = useState<"idle" | "success" | "manual">("idle");
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("success");
    } catch {
      setFeedback("manual");
    }
  }
  if (!hydrated) return null;
  return (
    <div className={styles.copy}>
      <button
        className={styles.button}
        type="button"
        disabled={disabled}
        onClick={() => void copy()}
      >
        {label}
      </button>
      <p className={styles.feedback} role="status" aria-live="polite">
        {feedback === "success"
          ? "已复制，可粘贴给 Agent。"
          : feedback === "manual"
            ? "浏览器未允许复制，请选中下面的原文手动复制。"
            : ""}
      </p>
      {feedback === "manual" ? (
        <textarea
          aria-label="手动复制原文"
          readOnly
          value={text}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      ) : null}
    </div>
  );
}

export function UsageGuides({
  buyer,
  merchant,
}: {
  buyer: ReactNode;
  merchant: ReactNode;
}): ReactNode {
  const hydrated = useHydrated();
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(event: KeyboardEvent<HTMLButtonElement>): void {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - selected;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }
  return (
    <div>
      {hydrated ? (
        <div className={styles.tabs} role="tablist" aria-label="选择使用身份">
          {["我是买家，想购买", "我是店主，想上架"].map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`guide-tab-${String(index)}`}
              aria-selected={selected === index}
              aria-controls={`guide-panel-${String(index)}`}
              tabIndex={selected === index ? 0 : -1}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              onClick={() => {
                setSelected(index);
              }}
              onKeyDown={move}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {[buyer, merchant].map((guide, index) => (
        <div
          key={index}
          id={`guide-panel-${String(index)}`}
          role={hydrated ? "tabpanel" : undefined}
          aria-labelledby={hydrated ? `guide-tab-${String(index)}` : undefined}
          hidden={hydrated && selected !== index}
          tabIndex={hydrated ? 0 : undefined}
          className={styles.guidePanel}
        >
          {guide}
        </div>
      ))}
    </div>
  );
}

export function VariantChooser({
  productId,
  variants,
}: {
  productId: string;
  variants: readonly PublicVariant[];
}): ReactNode {
  const available = variants.filter(
    (variant) => variant.availability === "in_stock" && variant.stock !== 0,
  );
  const [selectedId, setSelectedId] = useState(
    available.length === 1 ? (available[0]?.id ?? "") : "",
  );
  const hydrated = useHydrated();
  const selected = available.find((variant) => variant.id === selectedId);
  const text =
    selected === undefined
      ? ""
      : `我想购买商品 ${productId}，规格 ${selected.id}（${optionText(selected.optionValues)}）。请先查询当前价格和库存，向我确认商品、规格和数量后再购买。`;
  return (
    <>
      <fieldset className={styles.variantFieldset}>
        <legend>可售规格</legend>
        <ul className={styles.variants}>
          {variants.map((variant) => (
            <li key={variant.id}>
              <label
                className={`${styles.variant} ${selectedId === variant.id ? styles.selected : ""}`}
              >
                {hydrated ? (
                  <input
                    type="radio"
                    name="purchase-variant"
                    value={variant.id}
                    checked={selectedId === variant.id}
                    disabled={variant.availability !== "in_stock" || variant.stock === 0}
                    onChange={() => {
                      setSelectedId(variant.id);
                    }}
                  />
                ) : null}
                <span className={styles.variantBody}>
                  <span className={styles.variantTop}>
                    <strong>{optionText(variant.optionValues)}</strong>
                    <span className={styles.price}>
                      {displayPrice(variant.price, variant.currency)}
                    </span>
                  </span>
                  <span>
                    {variantStock(variant)} · {availabilityText(variant.availability)}
                  </span>
                  {variant.sku === null ? null : (
                    <span className={styles.muted}>SKU：{variant.sku}</span>
                  )}
                  <span className={styles.identifier}>规格 ID：{variant.id}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className={styles.assistance}>
        <p>
          {available.length === 0
            ? "当前规格均缺货，可以让 Agent 稍后重新查询。"
            : "选择规格后，把购买需求交给 Agent。Agent 会重新确认价格、库存和数量。"}
        </p>
        <noscript>请把商品 ID 和需要的规格交给 Agent，由它查询并确认当前商品信息。</noscript>
        <CopyText
          key={selectedId}
          text={text}
          label={selected === undefined ? "请先选择有货规格" : "复制购买需求"}
          disabled={selected === undefined}
        />
      </div>
    </>
  );
}
