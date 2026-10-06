declare const minorUnitBrand: unique symbol;

export type MinorUnits = number & { readonly [minorUnitBrand]: true };

export function minorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Monetary amounts must be integers in minor units");
  }
  return value as MinorUnits;
}
