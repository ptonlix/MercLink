export type ReleaseRow = {
  id: string;
  merchantId: string;
  sourceKey: string;
  fallback: "index.html" | null;
  authorizeBuyer: string | null;
  authorizeMerchant: string | null;
  createdAt: Date;
};

export type FileRow = {
  releaseId: string;
  path: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
};

export type PointerRow = {
  activeId: string | null;
  previousId: string | null;
};

export type ResetRequestRow = {
  id: string;
  merchantId: string;
  status: "pending" | "executed" | "rejected";
  createdAt: Date;
  decidedAt: Date | null;
};

export type StorefrontStore = {
  insertRelease(release: ReleaseRow, files: readonly FileRow[]): Promise<void>;
  latestSourceKey(): Promise<string | null>;
  readPointer(): Promise<PointerRow>;
  writePointer(pointer: PointerRow): Promise<void>;
  getRelease(id: string): Promise<ReleaseRow | null>;
  listFiles(releaseId: string): Promise<FileRow[]>;
  findFile(releaseId: string, path: string): Promise<FileRow | null>;
  insertResetRequest(request: ResetRequestRow): Promise<void>;
  getResetRequest(id: string): Promise<ResetRequestRow | null>;
  listObjectKeys(): Promise<string[]>;
  commitResetExecution(id: string, decidedAt: Date): Promise<boolean>;
};

export function createMemoryStore(): StorefrontStore & {
  releases: ReleaseRow[];
  files: FileRow[];
  pointer: PointerRow;
  resetRequests: ResetRequestRow[];
} {
  const releases: ReleaseRow[] = [];
  const files: FileRow[] = [];
  const pointer: PointerRow = { activeId: null, previousId: null };
  const resetRequests: ResetRequestRow[] = [];
  return {
    releases,
    files,
    pointer,
    insertRelease(release, nextFiles) {
      releases.push(release);
      files.push(...nextFiles);
      return Promise.resolve();
    },
    latestSourceKey() {
      const latest = releases[releases.length - 1];
      return Promise.resolve(latest?.sourceKey ?? null);
    },
    readPointer() {
      return Promise.resolve({ ...pointer });
    },
    writePointer(next) {
      pointer.activeId = next.activeId;
      pointer.previousId = next.previousId;
      return Promise.resolve();
    },
    getRelease(id) {
      return Promise.resolve(releases.find((release) => release.id === id) ?? null);
    },
    listFiles(releaseId) {
      return Promise.resolve(files.filter((file) => file.releaseId === releaseId));
    },
    findFile(releaseId, path) {
      return Promise.resolve(
        files.find((file) => file.releaseId === releaseId && file.path === path) ?? null,
      );
    },
    resetRequests,
    insertResetRequest(request) {
      resetRequests.push(request);
      return Promise.resolve();
    },
    getResetRequest(id) {
      return Promise.resolve(resetRequests.find((request) => request.id === id) ?? null);
    },
    listObjectKeys() {
      return Promise.resolve([
        ...releases.map((release) => release.sourceKey),
        ...files.map((file) => file.objectKey),
      ]);
    },
    commitResetExecution(id, decidedAt) {
      const request = resetRequests.find((item) => item.id === id);
      if (request === undefined || request.status !== "pending") {
        return Promise.resolve(false);
      }
      pointer.activeId = null;
      pointer.previousId = null;
      releases.splice(0, releases.length);
      files.splice(0, files.length);
      request.status = "executed";
      request.decidedAt = decidedAt;
      return Promise.resolve(true);
    },
  };
}
