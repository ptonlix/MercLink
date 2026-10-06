export type SmsResult = { ok: true } | { ok: false; message: string };

export type SmsPort = {
  sendCode: (input: { phone: string }) => Promise<SmsResult>;
  checkCode: (input: { phone: string; code: string }) => Promise<SmsResult>;
};
