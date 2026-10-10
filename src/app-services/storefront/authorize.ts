import {
  authorizeTemplateNames,
  buyerAuthorizeSubmit,
  merchantAuthorizeSubmit,
  prepareAuthorizeStep,
  type AuthorizeAppearance,
  type AuthorizeStepRender,
  type AuthorizeTemplateName,
} from "../../domain/storefront/authorize";
import { storefrontRuntime } from "./runtime";

export type AuthorizeAppearanceRequest = {
  kind: "buyer" | "merchant";
  step: "phone" | "code" | "password" | "approve" | "login" | "change-password";
  notice?: string | null;
  phone?: string;
  mode?: "login" | "register";
  accountName?: string;
  accountPhone?: string;
  pendingApproval?: boolean;
  devStubs?: boolean;
  captchaToken?: string;
  captchaMarkup?: string;
};

export async function loadAuthorizeAppearance(
  input: AuthorizeAppearanceRequest,
): Promise<AuthorizeAppearance | null> {
  const runtime = storefrontRuntime();
  if (runtime === undefined) {
    return null;
  }
  const spec = stepSpec(input);
  if (spec === null) {
    return null;
  }
  try {
    const pointer = await runtime.store.readPointer();
    if (pointer.activeId === null) {
      return null;
    }
    const release = await runtime.store.getRelease(pointer.activeId);
    if (release === null) {
      return null;
    }
    const declared = input.kind === "buyer" ? release.authorizeBuyer : release.authorizeMerchant;
    if (declared === null) {
      return null;
    }
    const file = await runtime.store.findFile(pointer.activeId, declared);
    if (file === null) {
      return null;
    }
    const object = await runtime.objectStorage.open(file.objectKey);
    if (object === null) {
      return null;
    }
    return prepareAuthorizeStep(new TextDecoder().decode(object.bytes), spec);
  } catch {
    return null;
  }
}

function stepSpec(input: AuthorizeAppearanceRequest): AuthorizeStepRender | null {
  const mode: "login" | "register" = input.mode === "login" ? "login" : "register";
  const shared = {
    notice: input.notice ?? null,
    phone: input.phone ?? "",
    mode,
    accountName: input.accountName ?? "",
    accountPhone: input.accountPhone ?? "",
    pendingApproval: input.pendingApproval === true,
    devStubs: input.devStubs === true,
    captchaToken: input.captchaToken ?? "",
    captchaMarkup: input.captchaMarkup,
  };
  if (input.kind === "buyer") {
    if (input.step === "phone") {
      return buyer(authorizeTemplateNames.phone, "sms", false, true, true, shared);
    }
    if (input.step === "code") {
      return buyer(authorizeTemplateNames.code, "check", true, false, false, shared);
    }
    if (input.step === "password") {
      return buyer(
        authorizeTemplateNames.password,
        mode === "register" ? "register" : "password",
        true,
        false,
        false,
        shared,
      );
    }
    if (input.step === "approve") {
      return buyer(authorizeTemplateNames.approve, null, false, false, false, shared);
    }
    return null;
  }
  if (input.step === "login") {
    return merchant(authorizeTemplateNames.merchantLogin, "login", shared);
  }
  if (input.step === "change-password") {
    return merchant(authorizeTemplateNames.merchantChangePassword, "change-password", shared);
  }
  if (input.step === "approve") {
    return merchant(authorizeTemplateNames.merchantApprove, null, shared);
  }
  return null;
}

function buyer(
  templateName: AuthorizeTemplateName,
  intent: string | null,
  bindPhone: boolean,
  clearPhoneValue: boolean,
  requireCaptchaSlot: boolean,
  shared: Omit<
    AuthorizeStepRender,
    | "templateName"
    | "submitAction"
    | "intent"
    | "bindPhone"
    | "clearPhoneValue"
    | "requireCaptchaSlot"
  >,
): AuthorizeStepRender {
  return {
    ...shared,
    templateName,
    submitAction: buyerAuthorizeSubmit,
    intent,
    bindPhone,
    clearPhoneValue,
    requireCaptchaSlot,
  };
}

function merchant(
  templateName: AuthorizeTemplateName,
  intent: string | null,
  shared: Omit<
    AuthorizeStepRender,
    | "templateName"
    | "submitAction"
    | "intent"
    | "bindPhone"
    | "clearPhoneValue"
    | "requireCaptchaSlot"
  >,
): AuthorizeStepRender {
  return {
    ...shared,
    templateName,
    submitAction: merchantAuthorizeSubmit,
    intent,
    bindPhone: false,
    clearPhoneValue: false,
    requireCaptchaSlot: false,
  };
}
