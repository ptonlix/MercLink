import Provider from "oidc-provider";
import { ensureSuperAdmin } from "../identity/admin";
import { findMerchant } from "../identity/merchants";
import { appRuntime } from "../identity/runtime";
import { registerAccessAuthenticator } from "./authenticate";
import { parseAccountId } from "./grants";
import { authorizationIssuer, createAccessProvider } from "./provider";

let providerPromise: Promise<Provider> | undefined;

export function getAccessProvider(): Promise<Provider> {
  providerPromise ??= createRegisteredProvider();
  return providerPromise;
}

async function createRegisteredProvider(): Promise<Provider> {
  const runtime = appRuntime();
  await ensureSuperAdmin(runtime.sql, {
    phone: runtime.env.ADMIN_PHONE,
    password: runtime.env.ADMIN_PASSWORD,
  });
  const provider = await createAccessProvider({
    issuer: authorizationIssuer(runtime.env.APP_BASE_URL),
    cookieSecret: runtime.env.OAUTH_SIGNING_SECRET,
    sql: runtime.sql,
    accounts: {
      isActive: (accountId) => accountIsActive(runtime.sql, accountId),
    },
  });
  registerAccessAuthenticator(runtime.sql, provider);
  return provider;
}

async function accountIsActive(
  sql: ReturnType<typeof appRuntime>["sql"],
  accountId: string,
): Promise<boolean> {
  const parsed = parseAccountId(accountId);
  if (parsed === null) {
    return false;
  }
  if (parsed.ownerType === "buyer") {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM buyers WHERE id = ${parsed.ownerId} AND deleted_at IS NULL
    `;
    return rows.length > 0;
  }
  const merchant = await findMerchant(sql, parsed.ownerId);
  return merchant !== null && merchant.status === "active" && merchant.deletedAt === null;
}
