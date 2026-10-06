export const scopes = [
  "field:write",
  "product:write",
  "product:read",
  "order:read",
  "order:write",
] as const;

export type Scope = (typeof scopes)[number];

const scopeSet: ReadonlySet<string> = new Set(scopes);

export function isScope(value: string): value is Scope {
  return scopeSet.has(value);
}

export function grantedScopes(input: readonly string[]): readonly Scope[] {
  const result: Scope[] = [];
  for (const scope of input) {
    if (!isScope(scope)) {
      throw new TypeError(`Unknown scope: ${scope}`);
    }
    if (!result.includes(scope)) {
      result.push(scope);
    }
  }
  return result;
}

export type AnonymousActor = {
  readonly type: "anonymous";
};

export type MerchantActor = {
  readonly type: "merchant";
  readonly merchantId: string;
  readonly ownerId: string;
  readonly grantId: string;
  readonly scopes: readonly Scope[];
};

export type BuyerActor = {
  readonly type: "buyer";
  readonly buyerId: string;
  readonly ownerId: string;
  readonly grantId: string;
  readonly scopes: readonly Scope[];
};

export type ScriptActor = {
  readonly type: "script";
  readonly ownerType: "merchant" | "buyer";
  readonly ownerId: string;
  readonly keyId: string;
  readonly scopes: readonly Scope[];
};

export type Actor = AnonymousActor | MerchantActor | BuyerActor | ScriptActor;

export function anonymousActor(): AnonymousActor {
  return { type: "anonymous" };
}

export function merchantActor(input: {
  merchantId: string;
  grantId: string;
  scopes: readonly string[];
}): MerchantActor {
  return {
    type: "merchant",
    merchantId: input.merchantId,
    ownerId: input.merchantId,
    grantId: input.grantId,
    scopes: grantedScopes(input.scopes),
  };
}

export function buyerActor(input: {
  buyerId: string;
  grantId: string;
  scopes: readonly string[];
}): BuyerActor {
  return {
    type: "buyer",
    buyerId: input.buyerId,
    ownerId: input.buyerId,
    grantId: input.grantId,
    scopes: grantedScopes(input.scopes),
  };
}

export function scriptActor(input: {
  ownerType: "merchant" | "buyer";
  ownerId: string;
  keyId: string;
  scopes: readonly string[];
}): ScriptActor {
  return {
    type: "script",
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    keyId: input.keyId,
    scopes: grantedScopes(input.scopes),
  };
}

export function hasScope(actor: Actor, scope: Scope): boolean {
  if (actor.type === "anonymous") {
    return false;
  }
  return actor.scopes.includes(scope);
}
