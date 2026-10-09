declare const minorUnitBrand: unique symbol;

export type MinorUnits = number & { readonly [minorUnitBrand]: true };

export function minorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Monetary amounts must be integers in minor units");
  }
  return value as MinorUnits;
}

// Provider payloads use yuan. Accept an integer or 1–2 decimal places only.
export function minorUnitsFromYuan(value: string): MinorUnits | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  const whole = Number(match[1]);
  const fractionText = match[2] ?? "";
  const fraction = fractionText.length === 0 ? 0 : Number(fractionText.padEnd(2, "0"));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) {
    return null;
  }
  const amount = whole * 100 + fraction;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return null;
  }
  return minorUnits(amount);
}
