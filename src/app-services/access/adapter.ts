import type { Sql } from "../../db/client";
import { tokenHash } from "../../domain/access/tokens";

type Payload = Record<string, unknown>;

type StoredRow = {
  payload: Payload;
  grant_id: string | null;
  expires_at: Date | null;
};

export function createOidcAdapter(sql: Sql): new (name: string) => OidcAdapter {
  return class PostgresAdapter implements OidcAdapter {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
    }

    async upsert(id: string, payload: Payload, expiresIn?: number): Promise<void> {
      const storedId = this.storageId(id);
      const stored = this.name === "RefreshToken" ? redactRefresh(payload, id, storedId) : payload;
      const grantId = stringField(payload, "grantId");
      const userCode = stringField(payload, "userCode");
      const uid = stringField(payload, "uid");
      const expiresAt =
        typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null;
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO oidc_records (model, id, payload, grant_id, user_code, uid, expires_at)
          VALUES (
            ${this.name}, ${storedId}, ${tx.json(toJson(stored))}, ${grantId}, ${userCode}, ${uid}, ${expiresAt}
          )
          ON CONFLICT (model, id) DO UPDATE SET
            payload = EXCLUDED.payload,
            grant_id = EXCLUDED.grant_id,
            user_code = EXCLUDED.user_code,
            uid = EXCLUDED.uid,
            expires_at = EXCLUDED.expires_at
        `;
        if (this.name === "RefreshToken" && grantId !== null) {
          await tx`
            UPDATE oauth_grants
            SET refresh_hash = ${storedId}, updated_at = now()
            WHERE id = ${grantId} AND revoked_at IS NULL
          `;
        }
      });
    }

    async find(id: string): Promise<Payload | undefined> {
      const storedId = this.storageId(id);
      const rows = await sql<StoredRow[]>`
        SELECT payload, grant_id, expires_at
        FROM oidc_records
        WHERE model = ${this.name} AND id = ${storedId}
          AND (expires_at IS NULL OR expires_at > now())
      `;
      const row = rows[0];
      if (row === undefined) {
        return undefined;
      }
      if (!(await this.grantAllows(row.grant_id, storedId))) {
        return undefined;
      }
      const payload = parsePayload(row.payload);
      return this.name === "RefreshToken" ? { ...payload, jti: id } : payload;
    }

    async findByUid(uid: string): Promise<Payload | undefined> {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM oidc_records
        WHERE model = ${this.name} AND uid = ${uid}
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `;
      const id = rows[0]?.id;
      return id === undefined ? undefined : this.find(id);
    }

    async findByUserCode(userCode: string): Promise<Payload | undefined> {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM oidc_records
        WHERE model = ${this.name} AND user_code = ${userCode}
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `;
      const id = rows[0]?.id;
      return id === undefined ? undefined : this.find(id);
    }

    async destroy(id: string): Promise<void> {
      await sql`DELETE FROM oidc_records WHERE model = ${this.name} AND id = ${this.storageId(id)}`;
    }

    async consume(id: string): Promise<void> {
      const storedId = this.storageId(id);
      const rows = await sql<{ payload: Payload }[]>`
        SELECT payload FROM oidc_records WHERE model = ${this.name} AND id = ${storedId}
      `;
      const payload = rows[0]?.payload;
      if (payload === undefined) {
        return;
      }
      const next = { ...parsePayload(payload), consumed: Math.floor(Date.now() / 1000) };
      await sql`
        UPDATE oidc_records SET payload = ${sql.json(toJson(next))}
        WHERE model = ${this.name} AND id = ${storedId}
      `;
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await sql`DELETE FROM oidc_records WHERE grant_id = ${grantId}`;
    }

    private storageId(id: string): string {
      return this.name === "RefreshToken" ? tokenHash(id) : id;
    }

    private async grantAllows(grantId: string | null, storedId: string): Promise<boolean> {
      if (grantId === null || (this.name !== "RefreshToken" && this.name !== "AccessToken")) {
        return true;
      }
      const rows = await sql<{ revoked_at: Date | null; refresh_hash: string | null }[]>`
        SELECT revoked_at, refresh_hash FROM oauth_grants WHERE id = ${grantId}
      `;
      const grant = rows[0];
      if (grant === undefined || grant.revoked_at !== null) {
        return false;
      }
      if (
        this.name === "RefreshToken" &&
        grant.refresh_hash !== null &&
        grant.refresh_hash !== storedId
      ) {
        return false;
      }
      return true;
    }
  };
}

export type OidcAdapter = {
  upsert(id: string, payload: Payload, expiresIn?: number): Promise<void>;
  find(id: string): Promise<Payload | undefined>;
  findByUid(uid: string): Promise<Payload | undefined>;
  findByUserCode(userCode: string): Promise<Payload | undefined>;
  destroy(id: string): Promise<void>;
  consume(id: string): Promise<void>;
  revokeByGrantId(grantId: string): Promise<void>;
};

function stringField(payload: Payload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactRefresh(payload: Payload, rawId: string, hash: string): Payload {
  const copy: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    copy[key] = value === rawId ? hash : value;
  }
  return copy;
}

function parsePayload(payload: Payload): Payload {
  return payload;
}

function toJson(value: Payload): Record<string, string | number | boolean | null> {
  return JSON.parse(JSON.stringify(value)) as Record<string, string | number | boolean | null>;
}
