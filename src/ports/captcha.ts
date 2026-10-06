export type CaptchaVerifyResult = { ok: true } | { ok: false; message: string };

export type CaptchaPort = {
  verify: (input: { captchaVerifyParam: string }) => Promise<CaptchaVerifyResult>;
};
