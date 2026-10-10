// BuyerCaptcha renders this same field markup. The authorize page inserts it into the form; the binder only starts the widget.
export function buyerCaptchaMarkup(prefix: string): string {
  return `<div class="captcha" data-captcha-region="cn" data-captcha-prefix="${escapeAttr(prefix)}"><div id="captcha-element"></div><input id="captchaVerifyParam" type="hidden" name="captchaVerifyParam" value=""></div>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
