const faqRequestFields = ["published", "items"] as const;

const itemFields = ["question", "answer"] as const;

const questionLimit = 80;
const answerLimit = 400;
const storeItemLimit = 12;
const productItemLimit = 8;

// Same markup rule as profile text. Newlines are rejected here, not stripped.
const markupPattern = /[<>]|\[(?:[^\]]+)\]\([^)]+\)|(^|\n)#{1,6}\s|\*\*|__|~~|`/;
const breakPattern = /[\r\n\u2028\u2029]/;
const controlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqDraft = {
  published: boolean;
  items: readonly FaqItem[];
};

export type FaqSecrets = {
  phone: string;
  email: string | null;
};

export type FaqScope = "store" | "product";

type FaqParseFailure = {
  ok: false;
  error: "validation_error";
  message: string;
};

export type FaqParseResult = { ok: true; value: FaqDraft } | FaqParseFailure;

export function parseFaqBody(input: unknown, scope: FaqScope, secrets: FaqSecrets): FaqParseResult {
  if (!isRecord(input)) {
    return invalid("请求体必须是 JSON 对象。");
  }
  const unknown = Object.keys(input).filter(
    (key) => !(faqRequestFields as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return invalid("不能提交未声明的字段。");
  }
  for (const field of faqRequestFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return invalid("请求缺少必填字段。");
    }
  }
  if (typeof input.published !== "boolean") {
    return invalid("published 必须是布尔值。");
  }
  if (!Array.isArray(input.items)) {
    return invalid("字段类型不正确。");
  }
  const limit = scope === "store" ? storeItemLimit : productItemLimit;
  if (input.items.length > limit) {
    return invalid(scope === "store" ? "全店问答最多 12 条。" : "商品问答最多 8 条。");
  }
  if (input.published && input.items.length === 0) {
    return invalid("没有条目时不能公开。");
  }
  const items: FaqItem[] = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    const parsed = parseItem(item, secrets);
    if (!parsed.ok) {
      return parsed;
    }
    if (seen.has(parsed.value.question)) {
      return invalid("同一份问答里的问题不能重复。");
    }
    seen.add(parsed.value.question);
    items.push(parsed.value);
  }
  return { ok: true, value: { published: input.published, items } };
}

function parseItem(
  input: unknown,
  secrets: FaqSecrets,
): { ok: true; value: FaqItem } | FaqParseFailure {
  if (!isRecord(input)) {
    return invalid("字段类型不正确。");
  }
  const unknown = Object.keys(input).filter(
    (key) => !(itemFields as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return invalid("不能提交未声明的字段。");
  }
  for (const field of itemFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return invalid("请求缺少必填字段。");
    }
  }
  const question = readLine(input.question, "问题", questionLimit);
  if (!question.ok) {
    return question;
  }
  const answer = readLine(input.answer, "答案", answerLimit);
  if (!answer.ok) {
    return answer;
  }
  if (containsSecret(question.value, secrets) || containsSecret(answer.value, secrets)) {
    return invalid("不能公开登录手机号或账号邮箱。");
  }
  return { ok: true, value: { question: question.value, answer: answer.value } };
}

function readLine(
  value: unknown,
  label: "问题" | "答案",
  limit: number,
): { ok: true; value: string } | FaqParseFailure {
  if (typeof value !== "string") {
    return invalid("字段类型不正确。");
  }
  if (breakPattern.test(value) || controlPattern.test(value) || markupPattern.test(value)) {
    return invalid("问答必须是单行纯文本，不能包含换行、HTML 或 Markdown。");
  }
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  if (length === 0) {
    return invalid(`${label}不能为空。`);
  }
  if (length > limit) {
    return invalid(label === "问题" ? "问题不能超过 80 个字符。" : "答案不能超过 400 个字符。");
  }
  return { ok: true, value: trimmed };
}

function containsSecret(value: string, secrets: FaqSecrets): boolean {
  const phone = secrets.phone.replace(/\D/g, "");
  if (phone.length > 0 && value.replace(/\D/g, "").includes(phone)) {
    return true;
  }
  const email = secrets.email?.trim().toLowerCase() ?? "";
  return email.length > 0 && value.toLowerCase().includes(email);
}

function invalid(message: string): FaqParseFailure {
  return { ok: false, error: "validation_error", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
