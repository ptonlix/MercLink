import type postgres from "postgres";

type SqlLike = postgres.Sql | postgres.TransactionSql;

export async function revokeMerchantAccess(sql: SqlLike, merchantId: string): Promise<void> {
  await sql`
    UPDATE oauth_grants
    SET revoked_at = now(), updated_at = now()
    WHERE owner_type = 'merchant' AND owner_id = ${merchantId} AND revoked_at IS NULL
  `;
  await sql`
    UPDATE api_keys
    SET revoked_at = now(), updated_at = now()
    WHERE owner_type = 'merchant' AND owner_id = ${merchantId} AND revoked_at IS NULL
  `;
  await sql`
    DELETE FROM oidc_records
    WHERE grant_id IN (
      SELECT id FROM oauth_grants
      WHERE owner_type = 'merchant' AND owner_id = ${merchantId}
    )
  `;
}
