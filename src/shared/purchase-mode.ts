const purchaseModeFlag = "MERCLINK_PURCHASE";

export const purchaseDisabledMessage = "本部署未开启买入。";

export type PurchaseModeResult = { ok: true; enabled: boolean } | { ok: false; message: string };

export function readPurchaseMode(
  source: Readonly<Record<string, string | undefined>>,
): PurchaseModeResult {
  const value = source[purchaseModeFlag];
  if (value === undefined || value.trim() === "" || value === "0") {
    return { ok: true, enabled: false };
  }
  if (value === "1") {
    return { ok: true, enabled: true };
  }
  return { ok: false, message: "MERCLINK_PURCHASE must be 0 or 1\n" };
}

let cached: boolean | undefined;

export function currentPurchaseEnabled(
  source: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (cached === undefined) {
    const read = readPurchaseMode(source);
    if (!read.ok) {
      throw new Error(read.message.trim());
    }
    cached = read.enabled;
  }
  return cached;
}

export function resetPurchaseModeCache(): void {
  cached = undefined;
}

const enabledUserSkillFile = "src/agent-docs/skill.md";
const disabledUserSkillFile = "src/agent-docs/skill-disabled.md";

export function userSkillFile(): string {
  return currentPurchaseEnabled() ? enabledUserSkillFile : disabledUserSkillFile;
}
