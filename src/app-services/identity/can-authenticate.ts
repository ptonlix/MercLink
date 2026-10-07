import type { Sql } from "../../db/client";
import { merchantCanAuthenticate } from "../../domain/identity/accounts";
import { findMerchant } from "./merchants";

export async function accountCanAuthenticate(
  sql: Sql,
  input: { ownerType: "merchant" | "buyer"; ownerId: string },
): Promise<boolean> {
  if (input.ownerType === "buyer") {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM buyers WHERE id = ${input.ownerId} AND deleted_at IS NULL
    `;
    return rows.length > 0;
  }
  const merchant = await findMerchant(sql, input.ownerId);
  return merchant !== null && merchantCanAuthenticate(merchant);
}
