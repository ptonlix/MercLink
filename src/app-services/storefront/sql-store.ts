import type { Sql } from "../../db/client";
import type { FileRow, PointerRow, ReleaseRow, StorefrontStore } from "./store";

type ReleaseRecord = {
  id: string;
  merchant_id: string;
  source_key: string;
  fallback: string | null;
  authorize_buyer: string | null;
  authorize_merchant: string | null;
  created_at: Date;
};

type FileRecord = {
  release_id: string;
  path: string;
  object_key: string;
  content_type: string;
  byte_size: number;
};

export function createSqlStore(sql: Sql): StorefrontStore {
  return {
    async insertRelease(release, files) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO storefront_releases (
            id, merchant_id, source_key, fallback, authorize_buyer, authorize_merchant, created_at
          )
          VALUES (
            ${release.id},
            ${release.merchantId},
            ${release.sourceKey},
            ${release.fallback},
            ${release.authorizeBuyer},
            ${release.authorizeMerchant},
            ${release.createdAt}
          )
        `;
        for (const file of files) {
          await tx`
            INSERT INTO storefront_files (release_id, path, object_key, content_type, byte_size)
            VALUES (
              ${file.releaseId},
              ${file.path},
              ${file.objectKey},
              ${file.contentType},
              ${file.byteSize}
            )
          `;
        }
      });
    },
    async latestSourceKey() {
      const rows = await sql<{ source_key: string }[]>`
        SELECT source_key
        FROM storefront_releases
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return rows[0]?.source_key ?? null;
    },
    async readPointer() {
      const rows = await sql<
        { active_release_id: string | null; previous_release_id: string | null }[]
      >`
        SELECT active_release_id, previous_release_id
        FROM storefront_pointer
        WHERE id = 'current'
      `;
      const row = rows[0];
      if (row === undefined) {
        return { activeId: null, previousId: null };
      }
      return { activeId: row.active_release_id, previousId: row.previous_release_id };
    },
    async writePointer(pointer: PointerRow) {
      await sql`
        UPDATE storefront_pointer
        SET active_release_id = ${pointer.activeId},
            previous_release_id = ${pointer.previousId},
            updated_at = now()
        WHERE id = 'current'
      `;
    },
    async getRelease(id) {
      const rows = await sql<ReleaseRecord[]>`
        SELECT id, merchant_id, source_key, fallback, authorize_buyer, authorize_merchant, created_at
        FROM storefront_releases
        WHERE id = ${id}
      `;
      const row = rows[0];
      return row === undefined ? null : releaseFrom(row);
    },
    async listFiles(releaseId) {
      const rows = await sql<FileRecord[]>`
        SELECT release_id, path, object_key, content_type, byte_size
        FROM storefront_files
        WHERE release_id = ${releaseId}
      `;
      return rows.map(fileFrom);
    },
    async findFile(releaseId, path) {
      const rows = await sql<FileRecord[]>`
        SELECT release_id, path, object_key, content_type, byte_size
        FROM storefront_files
        WHERE release_id = ${releaseId} AND path = ${path}
      `;
      const row = rows[0];
      return row === undefined ? null : fileFrom(row);
    },
  };
}

function releaseFrom(row: ReleaseRecord): ReleaseRow {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    sourceKey: row.source_key,
    fallback: row.fallback === "index.html" ? "index.html" : null,
    authorizeBuyer: row.authorize_buyer,
    authorizeMerchant: row.authorize_merchant,
    createdAt: row.created_at,
  };
}

function fileFrom(row: FileRecord): FileRow {
  return {
    releaseId: row.release_id,
    path: row.path,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
  };
}
