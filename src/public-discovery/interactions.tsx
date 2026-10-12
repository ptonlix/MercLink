"use client";

/* eslint-disable @next/next/no-img-element -- Covers come from the existing public image endpoint and must work without the image optimization service. */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChengduMark, Panda, SkillIcon } from "./storefront-icons";
import { buyerSkillPath } from "./site";
import type { PublicVariant } from "../shared/seams/public-products";
import {
  availabilityText,
  displayPrice,
  optionText,
  purchaseRequest,
  variantStock,
} from "./presentation";

const subscribe = (): (() => void) => () => undefined;
const hydratedSnapshot = (): boolean => true;
const serverSnapshot = (): boolean => false;

function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, hydratedSnapshot, serverSnapshot);
}

export function AnimatedIdentity({ name, summary }: { name: string; summary: string }): ReactNode {
  const title = useRef<HTMLSpanElement>(null);
  const panda = useRef<HTMLSpanElement>(null);
  const description = useRef<HTMLParagraphElement>(null);
  const typed = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const heading = title.current;
    const animal = panda.current;
    const paragraph = description.current;
    const text = typed.current;
    if (!heading || !animal || !paragraph || !text) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pause = document.querySelector<HTMLInputElement>("#store-motion-pause");
    let animation: Animation | undefined;
    let timer = 0;
    const reveal = (): void => {
      window.clearInterval(timer);
      paragraph.classList.remove("isTyping");
    };
    function position(): void {
      if (!heading || !animal) return;
      animation?.cancel();
      if (motion.matches) return;
      const bounds = heading.getBoundingClientRect();
      const letters = Array.from(heading.querySelectorAll<HTMLElement>(".titleLetter"));
      const points = letters.map((letter) => {
        const rect = letter.getBoundingClientRect();
        return { x: rect.left - bounds.left + rect.width / 2 - 24, y: rect.top - bounds.top - 26 };
      });
      const frames: Keyframe[] = [];
      points.forEach((point, index) => {
        const next = points[index + 1];
        frames.push({
          transform: `translate(${String(point.x)}px, ${String(point.y)}px) rotate(-5deg)`,
        });
        if (next)
          frames.push({
            transform: `translate(${String((point.x + next.x) / 2)}px, ${String(Math.min(point.y, next.y) - 9)}px) rotate(6deg)`,
          });
      });
      if (frames.length > 1)
        animation = animal.animate(frames, {
          duration: points.length * 650,
          iterations: Infinity,
          direction: "alternate",
          easing: "linear",
        });
      update();
    }
    function update(): void {
      if (motion.matches) {
        animation?.cancel();
        reveal();
      } else if (pause?.checked || document.hidden) {
        animation?.pause();
        reveal();
      } else animation?.play();
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(heading);
    if (!motion.matches && !pause?.checked && summary) {
      const characters = Array.from(summary);
      let count = 0;
      text.textContent = "";
      paragraph.classList.add("isTyping");
      timer = window.setInterval(
        () => {
          count += 1;
          text.textContent = characters.slice(0, count).join("");
          if (count >= characters.length) reveal();
        },
        Math.max(12, Math.min(40, 5500 / characters.length)),
      );
    }
    pause?.addEventListener("change", update);
    motion.addEventListener("change", position);
    document.addEventListener("visibilitychange", update);
    return () => {
      animation?.cancel();
      reveal();
      observer.disconnect();
      pause?.removeEventListener("change", update);
      motion.removeEventListener("change", position);
      document.removeEventListener("visibilitychange", update);
    };
  }, [name, summary]);
  return (
    <>
      <h1 className="storeName animatedName" aria-label={name}>
        <ChengduMark />
        <span className="titleLetters" ref={title}>
          <span className="visuallyHidden">{name}</span>
          <span aria-hidden="true">
            {name.split(" ").map((word, index) => (
              <span className="titleWord" key={index}>
                {Array.from(word).map((letter, i) => (
                  <span className="titleLetter" key={i}>
                    {letter}
                  </span>
                ))}
                {index < name.split(" ").length - 1 ? " " : null}
              </span>
            ))}
          </span>
          <span className="titlePanda" ref={panda} aria-hidden="true">
            <Panda />
          </span>
        </span>
      </h1>
      <p className="summary typedSummary" ref={description}>
        <span className="summaryOriginal">{summary}</span>
        <span className="summaryTyped" ref={typed} aria-hidden="true" />
      </p>
    </>
  );
}

export function ProductDeck({ children }: { children: ReactNode }): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const buttons = controls.current;
    if (!element || !buttons) return;
    const cards = Array.from(element.querySelectorAll<HTMLElement>(".deckCard"));
    if (cards.length < 2) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pause = document.querySelector<HTMLInputElement>("#store-motion-pause");
    const step = (Math.PI * 2) / cards.length;
    let phase = 0;
    let frame = 0;
    let lastTime = 0;
    let width = element.clientWidth;
    let hovered = false;
    let focused = false;
    let touching = false;
    let visible = true;
    let travel: { from: number; to: number; start: number } | null = null;
    const canRotate = (): boolean => !hovered && !focused && !touching && !pause?.checked;
    function draw(): void {
      const radius = Math.min(width * 0.34, 450);
      cards.forEach((card, index) => {
        const angle = index * step - phase;
        const depth = Math.cos(angle);
        const x = Math.sin(angle) * radius;
        const y = depth * (width < 600 ? 28 : 48);
        const z = depth * 180 - 100;
        card.style.transform = `translate3d(${String(x)}px, ${String(y)}px, ${String(z)}px) rotateY(${String(-Math.sin(angle) * 20)}deg) rotateZ(${String(Math.sin(angle) * 3)}deg)`;
        card.style.zIndex = String(Math.round((depth + 1) * 100));
        card.style.setProperty("--orbit-light", String(0.68 + (depth + 1) * 0.16));
      });
    }
    function tick(time: number): void {
      frame = 0;
      if (motion.matches || document.hidden || !visible) return;
      const elapsed = lastTime === 0 ? 0 : Math.min(time - lastTime, 64);
      lastTime = time;
      if (travel) {
        if (travel.start === 0) travel.start = time;
        const progress = Math.min((time - travel.start) / 750, 1);
        phase = travel.from + (travel.to - travel.from) * (1 - (1 - progress) ** 3);
        if (progress === 1) travel = null;
      } else if (canRotate()) phase += elapsed * 0.00015;
      draw();
      if (travel || canRotate()) frame = requestAnimationFrame(tick);
    }
    function resume(): void {
      if (frame || motion.matches || document.hidden || !visible) return;
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
    function configure(): void {
      cancelAnimationFrame(frame);
      frame = 0;
      if (motion.matches) {
        element?.removeAttribute("data-orbit");
        buttons?.removeAttribute("data-orbit");
        cards.forEach((card) => {
          card.style.removeProperty("transform");
          card.style.removeProperty("z-index");
          card.style.removeProperty("--orbit-light");
        });
      } else {
        element?.setAttribute("data-orbit", "ready");
        buttons?.setAttribute("data-orbit", "ready");
        draw();
        resume();
      }
    }
    function focus(event: FocusEvent): void {
      const card =
        event.target instanceof Element ? event.target.closest<HTMLElement>(".deckCard") : null;
      if (!card || !card.matches(":focus-visible")) return;
      focused = true;
      travel = null;
      const index = cards.indexOf(card);
      if (index >= 0) phase = index * step;
      if (!motion.matches) draw();
    }
    function blur(event: FocusEvent): void {
      if (event.relatedTarget instanceof Node && element?.contains(event.relatedTarget)) return;
      focused = false;
      resume();
    }
    function enter(event: PointerEvent): void {
      if (event.pointerType !== "touch") hovered = true;
    }
    function leave(): void {
      hovered = false;
      touching = false;
      resume();
    }
    function down(): void {
      touching = true;
    }
    function up(): void {
      touching = false;
      resume();
    }
    function navigate(event: MouseEvent): void {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("button[data-step]")
          : null;
      if (!button) return;
      const direction = Number(button.dataset.step);
      const destination =
        (direction > 0 ? Math.floor(phase / step + 0.05) + 1 : Math.ceil(phase / step - 0.05) - 1) *
        step;
      travel = { from: phase, to: destination, start: 0 };
      resume();
    }
    const resize = new ResizeObserver(() => {
      width = element.clientWidth;
      if (!motion.matches) draw();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) resume();
    });
    configure();
    resize.observe(element);
    intersection.observe(element);
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", blur);
    buttons.addEventListener("click", navigate);
    pause?.addEventListener("change", resume);
    motion.addEventListener("change", configure);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", blur);
      buttons.removeEventListener("click", navigate);
      pause?.removeEventListener("change", resume);
      motion.removeEventListener("change", configure);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [children]);
  return (
    <>
      <div className="productDeck" ref={root} aria-label="商品展台">
        {children}
      </div>
      <div className="orbitControls" ref={controls} aria-label="浏览商品">
        <button type="button" data-step="-1" aria-label="上一件商品">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <button type="button" data-step="1" aria-label="下一件商品">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </>
  );
}

export function GalleryArrow({
  target,
  direction,
}: {
  target: string;
  direction: "previous" | "next";
}): ReactNode {
  return (
    <label
      className={`galleryArrow ${direction}`}
      htmlFor={target}
      role="button"
      tabIndex={0}
      aria-label={direction === "previous" ? "上一张图片" : "下一张图片"}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d={direction === "previous" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
      </svg>
    </label>
  );
}

export function PublicImage({
  src,
  title,
  logo = false,
  eager = false,
}: {
  src: string | null;
  title: string;
  logo?: boolean;
  eager?: boolean;
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
    <span className={logo ? "logo" : "cover"}>
      <span className="placeholder" aria-hidden={src !== null && !failed}>
        {logo ? "店铺标识" : "暂无图片"}
      </span>
      {src === null || failed ? null : (
        <img
          ref={imageRef}
          src={src}
          alt={title}
          loading={eager ? "eager" : "lazy"}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}

function CopyText({
  text,
  label,
  disabled = false,
  skill = false,
}: {
  text: string;
  label: string;
  disabled?: boolean;
  skill?: boolean;
}): ReactNode {
  const [feedback, setFeedback] = useState<"idle" | "success" | "manual">("idle");
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("success");
    } catch {
      setFeedback("manual");
    }
  }
  return (
    <div className="copy">
      <div className="purchaseActions">
        <button className="button" type="button" disabled={disabled} onClick={() => void copy()}>
          {label}
        </button>
        {skill ? (
          <a
            className="skillIcon"
            href={buyerSkillPath}
            aria-label="查看用户 Skill"
            title="用户 Skill"
          >
            <SkillIcon />
          </a>
        ) : null}
      </div>
      <p className="feedback" role="status" aria-live="polite">
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
  buyerTabLabel = "我是用户，想购买",
}: {
  buyer: ReactNode;
  merchant: ReactNode;
  buyerTabLabel?: string;
}): ReactNode {
  return (
    <div className="guideTabs">
      <input
        className="guideTabInput"
        type="radio"
        name="usage-guide"
        id="usage-buyer"
        defaultChecked
      />
      <input className="guideTabInput" type="radio" name="usage-guide" id="usage-merchant" />
      <div className="tabs" aria-label="选择使用身份">
        <label htmlFor="usage-buyer" id="guide-tab-0">
          {buyerTabLabel}
        </label>
        <label htmlFor="usage-merchant" id="guide-tab-1">
          我是店主，想配置
        </label>
      </div>
      <div id="guide-panel-0" aria-labelledby="guide-tab-0" className="guidePanel buyerPanel">
        {buyer}
      </div>
      <div id="guide-panel-1" aria-labelledby="guide-tab-1" className="guidePanel merchantPanel">
        {merchant}
      </div>
    </div>
  );
}

export function VariantChooser({
  productId,
  variants,
  purchaseEnabled = true,
  participantsEnabled = false,
}: {
  participantsEnabled?: boolean;
  productId: string;
  variants: readonly PublicVariant[];
  purchaseEnabled?: boolean;
}): ReactNode {
  const available = variants.filter(
    (variant) => variant.availability === "in_stock" && variant.stock !== 0,
  );
  const [selectedId, setSelectedId] = useState(
    available.length === 1 ? (available[0]?.id ?? "") : "",
  );
  const [participants, setParticipants] = useState(1);
  const hydrated = useHydrated();
  const selected = available.find((variant) => variant.id === selectedId);
  const maximum = Math.max(1, selected?.stock ?? Number.MAX_SAFE_INTEGER);
  const count = Math.min(participants, maximum);
  const text =
    selected === undefined
      ? ""
      : purchaseRequest(productId, selected, participantsEnabled ? count : undefined);
  return (
    <>
      <fieldset className="variantFieldset">
        <legend>可售规格</legend>
        <ul className="variants">
          {variants.map((variant) => (
            <li key={variant.id}>
              <label className={`variant ${selectedId === variant.id ? "selected" : ""}`}>
                {hydrated ? (
                  <input
                    type="radio"
                    name="purchase-variant"
                    value={variant.id}
                    checked={selectedId === variant.id}
                    disabled={variant.availability !== "in_stock" || variant.stock === 0}
                    onChange={() => {
                      setSelectedId(variant.id);
                      setParticipants((current) =>
                        Math.min(current, Math.max(1, variant.stock ?? Number.MAX_SAFE_INTEGER)),
                      );
                    }}
                  />
                ) : null}
                <span className="variantBody">
                  <span className="variantTop">
                    <strong>{optionText(variant.optionValues)}</strong>
                    <span className="price">{displayPrice(variant.price, variant.currency)}</span>
                  </span>
                  <span>
                    {variantStock(variant)} · {availabilityText(variant.availability)}
                  </span>
                  {variant.sku === null ? null : <span className="muted">SKU：{variant.sku}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {participantsEnabled ? (
        <div className="participantRow">
          <label htmlFor="participant-count">
            人数 <span>Guests</span>
          </label>
          <div className="participantStepper" role="group" aria-label="选择人数">
            <button
              type="button"
              aria-label="减少人数"
              disabled={!hydrated || selected === undefined || count <= 1}
              onClick={() => {
                setParticipants(Math.max(1, count - 1));
              }}
            >
              −
            </button>
            <output id="participant-count" aria-live="polite">
              {count}
            </output>
            <button
              type="button"
              aria-label="增加人数"
              disabled={!hydrated || selected === undefined || count >= maximum}
              onClick={() => {
                setParticipants(Math.min(maximum, count + 1));
              }}
            >
              ＋
            </button>
          </div>
          <noscript>
            默认 1 人，请将实际参加人数告诉{purchaseEnabled ? " Agent" : "店主"}。
          </noscript>
        </div>
      ) : null}
      {purchaseEnabled ? (
        <div className="assistance">
          <p>
            {available.length === 0
              ? "当前规格均缺货，可以让 Agent 稍后重新查询。"
              : "选择规格后，把购买需求交给 Agent。Agent 会重新确认价格、库存和数量。"}
          </p>
          <noscript>
            没有脚本时，把本页地址交给 Agent。商品 ID、规格 ID 和整数分写在本页的 Markdown 里。
          </noscript>
          <CopyText
            key={`${selectedId}-${String(count)}`}
            skill
            text={text}
            label={selected === undefined ? "请先选择有货规格" : "复制购买需求"}
            disabled={selected === undefined}
          />
        </div>
      ) : (
        <a
          className="skillIcon"
          href={buyerSkillPath}
          aria-label="查看用户 Skill"
          title="用户 Skill"
        >
          <SkillIcon />
        </a>
      )}
    </>
  );
}
