import {
  elementAttr,
  extractAuthorizeTemplate,
  parseAuthorizeFragment,
  serializeAuthorizeNodes,
  type AuthorizeNode,
} from "./authorize-html";

export const authorizeTemplateNames = {
  phone: "authorize.phone",
  code: "authorize.code",
  password: "authorize.password",
  approve: "authorize.approve",
  merchantLogin: "authorize.merchant.login",
  merchantChangePassword: "authorize.merchant.change-password",
  merchantApprove: "authorize.merchant.approve",
} as const;

export type AuthorizeTemplateName =
  (typeof authorizeTemplateNames)[keyof typeof authorizeTemplateNames];

export const buyerAuthorizeSubmit = "/authorize/buyer/submit";
export const merchantAuthorizeSubmit = "/authorize/merchant/submit";

const captchaMountId = "merclink-authorize-captcha";

const untrustedCopy = [
  /验证码(?:是|为|填写|：|:)\s*\d{4,8}/g,
  /\b(?:sms\s*)?code\s*(?:is|=|:)\s*\d{4,8}/gi,
  /授权成功/g,
  /批准成功/g,
  /登录成功/g,
  /支付成功/g,
  /付款成功/g,
];

export type AuthorizeStepRender = {
  templateName: AuthorizeTemplateName;
  submitAction: typeof buyerAuthorizeSubmit | typeof merchantAuthorizeSubmit;
  notice: string | null;
  phone: string;
  mode: "login" | "register";
  accountName: string;
  accountPhone: string;
  pendingApproval: boolean;
  bindPhone: boolean;
  clearPhoneValue: boolean;
  intent: string | null;
  requireCaptchaSlot: boolean;
  devStubs: boolean;
  captchaToken: string;
  // Server-owned captcha field markup. Never taken from the uploaded template.
  captchaMarkup?: string;
};

export type AuthorizeAppearance = {
  html: string;
  injectCaptcha: boolean;
};

type ElementNode = Extract<AuthorizeNode, { kind: "element" }>;

// A template that cannot be proved safe falls back to the built-in page.
export function prepareAuthorizeStep(
  documentHtml: string,
  input: AuthorizeStepRender,
): AuthorizeAppearance | null {
  const extracted = extractAuthorizeTemplate(documentHtml, input.templateName);
  if (extracted === null) {
    return null;
  }
  const parsed = parseAuthorizeFragment(extracted);
  if (parsed === null) {
    return null;
  }
  const selected = selectState(parsed, input.mode, input.pendingApproval);
  if (selected === null) {
    return null;
  }
  return finishAppearance(selected, input);
}

function selectState(
  nodes: readonly AuthorizeNode[],
  mode: "login" | "register",
  pending: boolean,
): AuthorizeNode[] | null {
  const selected: AuthorizeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      selected.push(node);
      continue;
    }
    if (node.tag === "merclink-mode") {
      const name = elementAttr(node, "name");
      if (name !== "login" && name !== "register") {
        return null;
      }
      if (name !== mode) {
        continue;
      }
      const inner = selectState(node.children, mode, pending);
      if (inner === null) {
        return null;
      }
      selected.push(...inner);
      continue;
    }
    if (node.tag === "merclink-pending" || node.tag === "merclink-idle") {
      const keep = node.tag === "merclink-pending" ? pending : !pending;
      if (!keep) {
        continue;
      }
      const inner = selectState(node.children, mode, pending);
      if (inner === null) {
        return null;
      }
      selected.push(...inner);
      continue;
    }
    const children = selectState(node.children, mode, pending);
    if (children === null) {
      return null;
    }
    selected.push({ ...node, children });
  }
  return selected;
}

function finishAppearance(
  nodes: AuthorizeNode[],
  input: AuthorizeStepRender,
): AuthorizeAppearance | null {
  stripCopy(nodes);
  if (input.requireCaptchaSlot && captchaSlotPlacement(nodes) !== "inside") {
    return null;
  }
  const owned = dropOwnedControls(nodes, input);
  if (owned === null) {
    return null;
  }
  rewriteForms(owned, input.submitAction);
  const sawNotice = hasNoticeSlot(owned);
  const filled = fillSlots(owned, input);
  if (filled === null) {
    return null;
  }
  prependServerFields(filled, input);
  const withNotice = sawNotice ? filled : [...noticeNodes(input.notice), ...filled];
  if (input.devStubs) {
    unlockCaptchaSend(withNotice);
  }
  if (!hasForm(withNotice)) {
    return null;
  }
  if (input.requireCaptchaSlot && !input.devStubs && mountPlacement(withNotice) !== "inside") {
    return null;
  }
  const html = serializeAuthorizeNodes(withNotice);
  if (input.requireCaptchaSlot && !input.devStubs && !singleMount(html)) {
    return null;
  }
  return {
    html,
    injectCaptcha: input.requireCaptchaSlot && !input.devStubs,
  };
}

function captchaSlotPlacement(nodes: readonly AuthorizeNode[]): "inside" | "missing" | "bad" {
  const found = findCaptchaSlots(nodes, false);
  if (found.count === 0) {
    return "missing";
  }
  if (found.count !== 1 || !found.inside) {
    return "bad";
  }
  return "inside";
}

function findCaptchaSlots(
  nodes: readonly AuthorizeNode[],
  inForm: boolean,
): { count: number; inside: boolean } {
  let count = 0;
  let inside = false;
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    const form = inForm || node.tag === "form";
    if (node.tag === "merclink-slot" && elementAttr(node, "name") === "authorize.captcha") {
      count += 1;
      inside = form || inside;
    }
    const nested = findCaptchaSlots(node.children, form);
    count += nested.count;
    inside = inside || nested.inside;
  }
  return { count, inside };
}

function mountPlacement(nodes: readonly AuthorizeNode[]): "inside" | "bad" {
  const found = findCaptchaMounts(nodes, false);
  if (found.count === 1 && found.inside) {
    return "inside";
  }
  return "bad";
}

function findCaptchaMounts(
  nodes: readonly AuthorizeNode[],
  inForm: boolean,
): { count: number; inside: boolean } {
  let count = 0;
  let inside = false;
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    const form = inForm || node.tag === "form";
    if (elementAttr(node, "id") === captchaMountId && node.tag === "div" && form) {
      count += 1;
      inside = true;
    } else if (elementAttr(node, "id") === captchaMountId) {
      count += 1;
    }
    const nested = findCaptchaMounts(node.children, form);
    count += nested.count;
    inside = inside || nested.inside;
  }
  return { count, inside };
}

function singleMount(html: string): boolean {
  const marker = `id="${captchaMountId}"`;
  const first = html.indexOf(marker);
  return first >= 0 && html.indexOf(marker, first + marker.length) < 0;
}

function dropOwnedControls(
  nodes: readonly AuthorizeNode[],
  input: AuthorizeStepRender,
): AuthorizeNode[] | null {
  const next: AuthorizeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      next.push(node);
      continue;
    }
    const decision = ownedControl(node, input);
    if (decision === "reject") {
      return null;
    }
    if (decision === "drop") {
      continue;
    }
    const children = dropOwnedControls(node.children, input);
    if (children === null) {
      return null;
    }
    const attrs =
      decision === "clear-value" ? node.attrs.filter((attr) => attr.name !== "value") : node.attrs;
    next.push({ ...node, attrs, children });
  }
  return next;
}

function ownedControl(
  node: ElementNode,
  input: AuthorizeStepRender,
): "keep" | "drop" | "clear-value" | "reject" {
  const name = elementAttr(node, "name");
  if (name !== "phone" && name !== "code" && name !== "intent" && name !== "captchaVerifyParam") {
    return "keep";
  }
  if (node.tag !== "input") {
    return "reject";
  }
  const type = (elementAttr(node, "type") ?? "").toLowerCase();
  if (name === "captchaVerifyParam") {
    return "drop";
  }
  if (name === "phone") {
    if (input.bindPhone || type === "hidden") {
      return "drop";
    }
    return input.clearPhoneValue ? "clear-value" : "keep";
  }
  if (name === "code") {
    return type === "hidden" ? "drop" : "clear-value";
  }
  if (input.intent !== null || type !== "hidden") {
    return "drop";
  }
  return "keep";
}

function rewriteForms(nodes: AuthorizeNode[], action: string): void {
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    if (node.tag === "form") {
      setAttr(node, "action", action);
      setAttr(node, "method", "post");
    }
    if (
      (node.tag === "button" || node.tag === "input") &&
      elementAttr(node, "formaction") !== null
    ) {
      setAttr(node, "formaction", action);
    }
    rewriteForms(node.children, action);
  }
}

function fillSlots(
  nodes: readonly AuthorizeNode[],
  input: AuthorizeStepRender,
): AuthorizeNode[] | null {
  const filled: AuthorizeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      filled.push(node);
      continue;
    }
    if (node.tag === "merclink-slot") {
      const replacement = replaceSlot(node, input);
      if (replacement === null) {
        return null;
      }
      filled.push(...replacement);
      continue;
    }
    const children = fillSlots(node.children, input);
    if (children === null) {
      return null;
    }
    filled.push({ ...node, children });
  }
  return filled;
}

function replaceSlot(node: ElementNode, input: AuthorizeStepRender): AuthorizeNode[] | null {
  const name = elementAttr(node, "name");
  if (name === "authorize.captcha") {
    if (!input.requireCaptchaSlot) {
      return [node];
    }
    if (input.devStubs) {
      return [hiddenInput("captchaVerifyParam", input.captchaToken)];
    }
    const markup = input.captchaMarkup ?? "";
    if (markup.includes(captchaMountId) || markup.includes("<script")) {
      return null;
    }
    return [
      {
        kind: "element",
        tag: "div",
        attrs: [{ name: "id", value: captchaMountId }],
        children: [],
        trustedHtml: markup,
      },
    ];
  }
  if (name === "authorize.notice") {
    return noticeNodes(input.notice);
  }
  if (name === "authorize.phone") {
    return [{ kind: "text", text: input.phone }];
  }
  if (name === "authorize.account.name") {
    return [{ kind: "text", text: input.accountName }];
  }
  if (name === "authorize.account.phone") {
    return [{ kind: "text", text: input.accountPhone }];
  }
  return [node];
}

function prependServerFields(nodes: AuthorizeNode[], input: AuthorizeStepRender): void {
  const fields: AuthorizeNode[] = [];
  if (input.intent !== null) {
    fields.push(hiddenInput("intent", input.intent));
  }
  if (input.bindPhone) {
    fields.push(hiddenInput("phone", input.phone));
  }
  if (fields.length === 0) {
    return;
  }
  const walk = (list: AuthorizeNode[]): void => {
    for (const node of list) {
      if (node.kind !== "element") {
        continue;
      }
      if (node.tag === "form") {
        node.children = [...fields.map(cloneNode), ...node.children];
      }
      walk(node.children);
    }
  };
  walk(nodes);
}

function unlockCaptchaSend(nodes: AuthorizeNode[]): void {
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    if (node.tag === "button" && elementAttr(node, "id") === "captcha-send") {
      node.attrs = node.attrs.filter((attr) => attr.name !== "disabled");
    }
    unlockCaptchaSend(node.children);
  }
}

function hasNoticeSlot(nodes: readonly AuthorizeNode[]): boolean {
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    if (node.tag === "merclink-slot" && elementAttr(node, "name") === "authorize.notice") {
      return true;
    }
    if (hasNoticeSlot(node.children)) {
      return true;
    }
  }
  return false;
}

function hasForm(nodes: readonly AuthorizeNode[]): boolean {
  for (const node of nodes) {
    if (node.kind !== "element") {
      continue;
    }
    if (node.tag === "form" || hasForm(node.children)) {
      return true;
    }
  }
  return false;
}

function noticeNodes(notice: string | null): AuthorizeNode[] {
  if (notice === null || notice.trim() === "") {
    return [];
  }
  return [
    {
      kind: "element",
      tag: "p",
      attrs: [
        { name: "class", value: "notice" },
        { name: "role", value: "alert" },
        { name: "aria-live", value: "polite" },
      ],
      children: [{ kind: "text", text: notice }],
    },
  ];
}

function hiddenInput(name: string, value: string): ElementNode {
  return {
    kind: "element",
    tag: "input",
    attrs: [
      { name: "type", value: "hidden" },
      { name: "name", value: name },
      { name: "value", value },
    ],
    children: [],
  };
}

function cloneNode(node: AuthorizeNode): AuthorizeNode {
  if (node.kind === "text") {
    return { kind: "text", text: node.text };
  }
  return {
    kind: "element",
    tag: node.tag,
    attrs: node.attrs.map((attr) => ({ ...attr })),
    children: node.children.map(cloneNode),
    trustedHtml: node.trustedHtml,
  };
}

function setAttr(node: ElementNode, name: string, value: string): void {
  const existing = node.attrs.find((attr) => attr.name === name);
  if (existing === undefined) {
    node.attrs.push({ name, value });
    return;
  }
  existing.value = value;
}

function stripCopy(nodes: AuthorizeNode[]): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      node.text = stripUntrustedCopy(node.text);
      continue;
    }
    for (const attr of node.attrs) {
      attr.value = stripUntrustedCopy(attr.value);
    }
    stripCopy(node.children);
  }
}

function stripUntrustedCopy(value: string): string {
  let current = value;
  for (const pattern of untrustedCopy) {
    current = current.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  return current;
}
