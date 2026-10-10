// Authorize templates are inserted with dangerouslySetInnerHTML. Anything this
// tokenizer cannot prove is an allowlisted fragment is rejected, not stripped.

type AuthorizeAttr = {
  name: string;
  value: string;
};

export type AuthorizeNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;
      attrs: AuthorizeAttr[];
      children: AuthorizeNode[];
      trustedHtml?: string;
    };

const captchaMountId = "merclink-authorize-captcha";

const allowedTags = new Set([
  "a",
  "aside",
  "button",
  "form",
  "h1",
  "h2",
  "input",
  "label",
  "li",
  "main",
  "merclink-idle",
  "merclink-mode",
  "merclink-pending",
  "merclink-slot",
  "ol",
  "p",
]);

const allowedAttrs: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["class", "href"]),
  aside: new Set(["class"]),
  button: new Set(["disabled", "formaction", "id", "type"]),
  form: new Set(["action", "class", "method"]),
  h1: new Set(),
  h2: new Set(),
  input: new Set([
    "autocomplete",
    "formaction",
    "id",
    "inputmode",
    "name",
    "required",
    "type",
    "value",
  ]),
  label: new Set(),
  li: new Set(["aria-current"]),
  main: new Set(["class"]),
  "merclink-idle": new Set(["name"]),
  "merclink-mode": new Set(["name"]),
  "merclink-pending": new Set(["name"]),
  "merclink-slot": new Set(["name"]),
  ol: new Set(["aria-label", "class"]),
  p: new Set(["aria-live", "class", "role"]),
};

const inputNames = new Set([
  "captchaVerifyParam",
  "code",
  "currentPassword",
  "email",
  "intent",
  "nextPassword",
  "password",
  "phone",
]);

const inputTypes = new Set(["email", "hidden", "password", "text"]);

const urlAttrs = new Set(["action", "formaction", "href"]);

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  AMP: "&",
  apos: "'",
  colon: ":",
  Colon: ":",
  gt: ">",
  GT: ">",
  lt: "<",
  LT: "<",
  nbsp: "\u00a0",
  NewLine: "\n",
  plus: "+",
  quot: '"',
  QUOT: '"',
  sol: "/",
  tab: "\t",
  Tab: "\t",
};

const maxDepth = 32;

export function extractAuthorizeTemplate(html: string, name: string): string | null {
  if (html.includes("\0")) {
    return null;
  }
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      return null;
    }
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) {
        return null;
      }
      index = end + 3;
      continue;
    }
    if (html.startsWith("<!", start) || html.startsWith("<?", start)) {
      index = start + 1;
      continue;
    }
    if (html.startsWith("</", start)) {
      const end = html.indexOf(">", start + 2);
      index = end < 0 ? start + 1 : end + 1;
      continue;
    }
    const open = parseStartTag(html, start);
    if (open === null) {
      index = start + 1;
      continue;
    }
    if (open.name === "script" || open.name === "style") {
      const rawEnd = rawTextEnd(html, open.end, open.name);
      if (rawEnd === null) {
        return null;
      }
      index = rawEnd;
      continue;
    }
    if (open.name === "template" && attrValue(open.attrs, "data-merclink") === name) {
      return templateInner(html, open.end);
    }
    index = open.end;
  }
  return null;
}

type Frame = {
  tag: string;
  attrs: AuthorizeAttr[];
  children: AuthorizeNode[];
};

export function parseAuthorizeFragment(html: string): AuthorizeNode[] | null {
  if (html.includes("\0")) {
    return null;
  }
  const root: AuthorizeNode[] = [];
  const stack: Frame[] = [{ tag: "#root", attrs: [], children: root }];
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      if (!pushText(stack, html.slice(index))) {
        return null;
      }
      break;
    }
    if (start > index && !pushText(stack, html.slice(index, start))) {
      return null;
    }
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) {
        return null;
      }
      index = end + 3;
      continue;
    }
    if (html.startsWith("<!", start) || html.startsWith("<?", start)) {
      return null;
    }
    if (html.startsWith("</", start)) {
      const close = parseEndTag(html, start);
      if (close === null) {
        return null;
      }
      const frame = stack[stack.length - 1];
      if (frame === undefined || frame.tag !== close.name) {
        return null;
      }
      if (close.name === "merclink-slot" && !slotChildrenEmpty(frame.children)) {
        return null;
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        return null;
      }
      parent.children.push({
        kind: "element",
        tag: close.name,
        attrs: frame.attrs,
        children: frame.children,
      });
      index = close.end;
      continue;
    }
    const open = parseStartTag(html, start);
    if (open === null || !tagAllowed(open)) {
      return null;
    }
    if (open.name === "form" && stack.some((frame) => frame.tag === "form")) {
      return null;
    }
    if (open.selfClosing || open.name === "input") {
      if (open.selfClosing && open.name !== "input" && open.name !== "merclink-slot") {
        return null;
      }
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        return null;
      }
      parent.children.push({ kind: "element", tag: open.name, attrs: open.attrs, children: [] });
      index = open.end;
      continue;
    }
    if (stack.length >= maxDepth) {
      return null;
    }
    stack.push({ tag: open.name, attrs: open.attrs, children: [] });
    index = open.end;
  }
  if (stack.length !== 1) {
    return null;
  }
  return root;
}

export function serializeAuthorizeNodes(nodes: readonly AuthorizeNode[]): string {
  return nodes.map(serializeNode).join("");
}

export function elementAttr(
  node: Extract<AuthorizeNode, { kind: "element" }>,
  name: string,
): string | null {
  return attrValue(node.attrs, name);
}

type OpenTag = {
  name: string;
  attrs: AuthorizeAttr[];
  selfClosing: boolean;
  end: number;
};

function parseStartTag(html: string, start: number): OpenTag | null {
  let index = start + 1;
  if (!isNameStart(charAt(html, index))) {
    return null;
  }
  const nameStart = index;
  index += 1;
  while (isNameChar(charAt(html, index))) {
    index += 1;
  }
  const name = html.slice(nameStart, index).toLowerCase();
  const attrs: AuthorizeAttr[] = [];
  const seen = new Set<string>();
  while (index < html.length) {
    const current = charAt(html, index);
    if (current === "/") {
      if (charAt(html, index + 1) === ">") {
        return { name, attrs, selfClosing: true, end: index + 2 };
      }
      index += 1;
      continue;
    }
    if (current === ">") {
      return { name, attrs, selfClosing: false, end: index + 1 };
    }
    if (isSpace(current)) {
      index += 1;
      continue;
    }
    if (!isNameStart(current)) {
      return null;
    }
    const attrStart = index;
    index += 1;
    while (isAttrNameChar(charAt(html, index))) {
      index += 1;
    }
    const attrName = html.slice(attrStart, index).toLowerCase();
    while (isSpace(charAt(html, index))) {
      index += 1;
    }
    let value = "";
    if (charAt(html, index) === "=") {
      index += 1;
      while (isSpace(charAt(html, index))) {
        index += 1;
      }
      const quote = charAt(html, index);
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < html.length && charAt(html, index) !== quote) {
          index += 1;
        }
        if (index >= html.length) {
          return null;
        }
        value = html.slice(valueStart, index);
        index += 1;
      } else {
        if (quote === "") {
          return null;
        }
        const valueStart = index;
        while (
          index < html.length &&
          !isSpace(charAt(html, index)) &&
          charAt(html, index) !== ">"
        ) {
          index += 1;
        }
        value = html.slice(valueStart, index);
      }
    }
    const decoded = decodeAttributeEntities(value);
    if (decoded === null || seen.has(attrName) || isEventHandler(attrName)) {
      return null;
    }
    if (urlAttrs.has(attrName) && dangerousUrl(decoded)) {
      return null;
    }
    if (attrName === "id" && decoded === captchaMountId) {
      return null;
    }
    seen.add(attrName);
    attrs.push({ name: attrName, value: decoded });
  }
  return null;
}

function parseEndTag(html: string, start: number): { name: string; end: number } | null {
  let index = start + 2;
  if (!isNameStart(charAt(html, index))) {
    return null;
  }
  const nameStart = index;
  index += 1;
  while (isNameChar(charAt(html, index))) {
    index += 1;
  }
  const name = html.slice(nameStart, index).toLowerCase();
  while (isSpace(charAt(html, index))) {
    index += 1;
  }
  if (charAt(html, index) !== ">") {
    return null;
  }
  return { name, end: index + 1 };
}

function tagAllowed(open: OpenTag): boolean {
  const attrs = allowedAttrs[open.name];
  if (!allowedTags.has(open.name) || attrs === undefined) {
    return false;
  }
  for (const attr of open.attrs) {
    if (!attrs.has(attr.name) || !attrValueAllowed(open.name, attr)) {
      return false;
    }
  }
  return true;
}

function attrValueAllowed(tag: string, attr: AuthorizeAttr): boolean {
  if (tag === "input" && attr.name === "name") {
    return inputNames.has(attr.value);
  }
  if (tag === "input" && attr.name === "type") {
    return inputTypes.has(attr.value.toLowerCase());
  }
  if (tag === "button" && attr.name === "type") {
    return attr.value.toLowerCase() === "submit";
  }
  if (tag === "button" && attr.name === "id") {
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(attr.value);
  }
  if (tag === "p" && attr.name === "role") {
    return attr.value === "alert";
  }
  if (tag === "p" && attr.name === "aria-live") {
    return attr.value === "polite";
  }
  if (tag === "li" && attr.name === "aria-current") {
    return attr.value === "step";
  }
  if (
    (tag === "merclink-slot" ||
      tag === "merclink-mode" ||
      tag === "merclink-pending" ||
      tag === "merclink-idle") &&
    attr.name === "name"
  ) {
    return /^[a-z0-9._-]+$/.test(attr.value);
  }
  return true;
}

function pushText(stack: { children: AuthorizeNode[] }[], text: string): boolean {
  const decoded = decodeAttributeEntities(text);
  if (decoded === null) {
    return false;
  }
  const parent = stack[stack.length - 1];
  if (parent === undefined) {
    return false;
  }
  if (decoded.length > 0) {
    parent.children.push({ kind: "text", text: decoded });
  }
  return true;
}

function slotChildrenEmpty(children: readonly AuthorizeNode[]): boolean {
  return children.every((child) => child.kind === "text" && child.text.trim() === "");
}

function templateInner(html: string, from: number): string | null {
  let depth = 1;
  let index = from;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      return null;
    }
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) {
        return null;
      }
      index = end + 3;
      continue;
    }
    if (html.startsWith("</template", start)) {
      const close = parseEndTag(html, start);
      if (close === null || close.name !== "template") {
        return null;
      }
      depth -= 1;
      if (depth === 0) {
        return html.slice(from, start);
      }
      index = close.end;
      continue;
    }
    if (
      html.startsWith("<!", start) ||
      html.startsWith("<?", start) ||
      html.startsWith("</", start)
    ) {
      const end = html.indexOf(">", start + 2);
      index = end < 0 ? start + 1 : end + 1;
      continue;
    }
    const open = parseStartTag(html, start);
    if (open === null) {
      index = start + 1;
      continue;
    }
    if (open.name === "template") {
      depth += 1;
    }
    if (open.name === "script" || open.name === "style") {
      const rawEnd = rawTextEnd(html, open.end, open.name);
      if (rawEnd === null) {
        return null;
      }
      index = rawEnd;
      continue;
    }
    index = open.end;
  }
  return null;
}

function rawTextEnd(html: string, from: number, tag: string): number | null {
  const pattern = new RegExp(`</${tag}\\s*>`, "gi");
  pattern.lastIndex = from;
  const match = pattern.exec(html);
  if (match === null) {
    return null;
  }
  return match.index + match[0].length;
}

function serializeNode(node: AuthorizeNode): string {
  if (node.kind === "text") {
    return escapeText(node.text);
  }
  const attrs = node.attrs.map((attr) => ` ${attr.name}="${escapeAttr(attr.value)}"`).join("");
  if (node.trustedHtml !== undefined) {
    return `<${node.tag}${attrs}>${node.trustedHtml}</${node.tag}>`;
  }
  if (node.tag === "input") {
    return `<input${attrs}>`;
  }
  return `<${node.tag}${attrs}>${serializeAuthorizeNodes(node.children)}</${node.tag}>`;
}

function decodeAttributeEntities(value: string): string | null {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = charAt(value, index);
    if (current !== "&") {
      out += current;
      continue;
    }
    const entity = readEntity(value, index);
    if (entity === null) {
      out += "&";
      continue;
    }
    if (entity.value.includes("\0")) {
      return null;
    }
    out += entity.value;
    index = entity.next - 1;
  }
  return out.includes("\0") ? null : out;
}

function readEntity(value: string, start: number): { value: string; next: number } | null {
  if (charAt(value, start + 1) === "#") {
    return readNumericEntity(value, start);
  }
  let index = start + 1;
  const nameStart = index;
  while (index < value.length && /[A-Za-z]/.test(charAt(value, index))) {
    index += 1;
  }
  if (index === nameStart) {
    return null;
  }
  const name = value.slice(nameStart, index);
  const mapped = namedEntities[name];
  if (mapped === undefined) {
    return null;
  }
  if (charAt(value, index) === ";") {
    return { value: mapped, next: index + 1 };
  }
  if (/[A-Za-z0-9]/.test(charAt(value, index))) {
    return null;
  }
  return { value: mapped, next: index };
}

function readNumericEntity(value: string, start: number): { value: string; next: number } | null {
  let index = start + 2;
  const hex = charAt(value, index) === "x" || charAt(value, index) === "X";
  if (hex) {
    index += 1;
  }
  const digitStart = index;
  const digit = hex ? /[0-9a-fA-F]/ : /[0-9]/;
  while (index < value.length && digit.test(charAt(value, index))) {
    index += 1;
  }
  if (index === digitStart || index - digitStart > 7) {
    return null;
  }
  const codePoint = Number.parseInt(value.slice(digitStart, index), hex ? 16 : 10);
  if (
    !Number.isInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return null;
  }
  if (charAt(value, index) === ";") {
    index += 1;
  }
  return { value: String.fromCodePoint(codePoint), next: index };
}

function dangerousUrl(value: string): boolean {
  const compact = stripUrlIgnorables(value);
  if (compact.startsWith("//")) {
    return true;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (scheme === null) {
    return false;
  }
  const name = scheme[1]?.toLowerCase() ?? "";
  return name !== "http" && name !== "https";
}

function stripUrlIgnorables(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) {
      continue;
    }
    out += char;
  }
  return out;
}

function isEventHandler(name: string): boolean {
  return name.startsWith("on") && name.length > 2;
}

function attrValue(attrs: readonly AuthorizeAttr[], name: string): string | null {
  const found = attrs.find((attr) => attr.name === name);
  return found === undefined ? null : found.value;
}

function isNameStart(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function isNameChar(value: string): boolean {
  return /[A-Za-z0-9-]/.test(value);
}

function isAttrNameChar(value: string): boolean {
  return /[A-Za-z0-9_:-]/.test(value);
}

function isSpace(value: string): boolean {
  return value === " " || value === "\n" || value === "\r" || value === "\t" || value === "\f";
}

function charAt(value: string, index: number): string {
  return value.charAt(index);
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
