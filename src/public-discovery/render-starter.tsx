import { renderToStaticMarkup } from "react-dom/server";
import { BuyerAuthorizeView, MerchantAuthorizeView } from "../app/authorize/views";
import {
  LandingTemplate,
  OrderResultTemplate,
  ProductListTemplate,
  ProductTemplate,
} from "./views";

type StarterName =
  | "index.html"
  | "products/index.html"
  | "products/item.html"
  | "account/buyer.html"
  | "account/merchant.html"
  | "pay/result.html";

const buyerShell = {
  template: true,
  notice: null,
  phone: "",
  captchaPrefix: "",
  captchaSceneId: "",
} as const;

export function renderStarterFragments(): Record<StarterName, string> {
  return {
    "index.html": renderToStaticMarkup(<LandingTemplate />),
    "products/index.html": renderToStaticMarkup(<ProductListTemplate />),
    "products/item.html": renderToStaticMarkup(<ProductTemplate />),
    "account/buyer.html": buyerAuthorizeShell(),
    "account/merchant.html": merchantAuthorizeShell(),
    "pay/result.html": renderToStaticMarkup(<OrderResultTemplate />),
  };
}

function buyerAuthorizeShell(): string {
  const phone = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="phone" mode="register" />,
  );
  const code = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="code" mode="register" />,
  );
  const register = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="password" mode="register" />,
  );
  const login = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="password" mode="login" />,
  );
  const pending = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="approve" mode="login" pendingApproval />,
  );
  const idle = renderToStaticMarkup(
    <BuyerAuthorizeView {...buyerShell} step="approve" mode="login" pendingApproval={false} />,
  );
  return `${shellNote("/authorize/buyer", "买家授权")}${stepTemplate(
    "authorize.phone",
    explicitSlots(phone),
  )}${stepTemplate("authorize.code", explicitSlots(code))}${stepTemplate(
    "authorize.password",
    `<merclink-mode name="register">${explicitSlots(register)}</merclink-mode><merclink-mode name="login">${explicitSlots(login)}</merclink-mode>`,
  )}${stepTemplate(
    "authorize.approve",
    `<merclink-pending name="approve">${explicitSlots(pending)}</merclink-pending><merclink-idle name="approve">${explicitSlots(idle)}</merclink-idle>`,
  )}`;
}

function merchantAuthorizeShell(): string {
  const login = renderToStaticMarkup(
    <MerchantAuthorizeView template notice={null} mustChangePassword={false} />,
  );
  const changePassword = renderToStaticMarkup(
    <MerchantAuthorizeView
      template
      notice={null}
      mustChangePassword
      account={{ name: "", phone: "" }}
    />,
  );
  const approve = renderToStaticMarkup(
    <MerchantAuthorizeView
      template
      notice={null}
      mustChangePassword={false}
      account={{ name: "", phone: "" }}
    />,
  );
  return `${shellNote("/authorize/merchant", "商家授权")}${stepTemplate(
    "authorize.merchant.login",
    explicitSlots(login),
  )}${stepTemplate(
    "authorize.merchant.change-password",
    explicitSlots(changePassword),
  )}${stepTemplate("authorize.merchant.approve", explicitSlots(approve))}`;
}

function shellNote(href: string, label: string): string {
  return `<main class="ml-auth"><p class="lede">这一页只保存授权步骤外观。登录、验证码和批准仍在 <a href="${href}">${label}</a> 完成。</p></main>`;
}

function stepTemplate(name: string, html: string): string {
  return `<template data-merclink="${name}">${html}</template>`;
}

function explicitSlots(html: string): string {
  return html.replace(/<merclink-slot\b([^>]*?)\/>/g, "<merclink-slot$1></merclink-slot>");
}
