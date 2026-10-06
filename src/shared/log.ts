const sensitiveKey =
  /password|passwd|secret|token|authorization|api[-_]?key|private[-_]?key|sms|otp|captcha|verification[-_]?code/i;

const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function redactText(text: string, secrets: readonly string[] = []): string {
  let redacted = text.replace(bearerPattern, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }
  return redacted;
}

export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") {
    return redactText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets));
  }
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      redacted[key] = sensitiveKey.test(key) ? "[redacted]" : redactValue(nested, secrets);
    }
    return redacted;
  }
  return value;
}

export type RequestLogInput = {
  method: string;
  path: string;
  headers: Headers;
  bodyText?: string;
};

function bearerToken(headers: Headers): string | undefined {
  const header = headers.get("authorization");
  if (header === null) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match?.[1];
}

function parseBody(bodyText: string | undefined): unknown {
  if (bodyText === undefined || bodyText === "") {
    return undefined;
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

export function formatRequestLog(input: RequestLogInput): string {
  const token = bearerToken(input.headers);
  const headerRecord: Record<string, string> = {};
  input.headers.forEach((value, key) => {
    headerRecord[key] = value;
  });
  const payload = {
    method: input.method,
    path: input.path,
    headers: headerRecord,
    body: parseBody(input.bodyText),
  };
  const secrets = token === undefined ? [] : [token];
  return JSON.stringify(redactValue(payload, secrets));
}

export function logRequest(input: RequestLogInput): void {
  process.stdout.write(`${formatRequestLog(input)}\n`);
}

let loggingStarted = false;

export function startLogging(): void {
  if (loggingStarted) {
    return;
  }
  loggingStarted = true;
  const wrap =
    (write: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      write(...args.map((arg) => redactValue(arg)));
    };
  console.log = wrap(console.log.bind(console));
  console.info = wrap(console.info.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.error = wrap(console.error.bind(console));
}
