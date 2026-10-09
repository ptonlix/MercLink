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

export type StorefrontStore = {
  insertRelease(release: ReleaseRow, files: readonly FileRow[]): Promise<void>;
  latestSourceKey(): Promise<string | null>;
  readPointer(): Promise<PointerRow>;
  writePointer(pointer: PointerRow): Promise<void>;
  getRelease(id: string): Promise<ReleaseRow | null>;
  listFiles(releaseId: string): Promise<FileRow[]>;
  findFile(releaseId: string, path: string): Promise<FileRow | null>;
};

export function createMemoryStore(): StorefrontStore & {
  releases: ReleaseRow[];
  files: FileRow[];
  pointer: PointerRow;
} {
  const releases: ReleaseRow[] = [];
  const files: FileRow[] = [];
  const pointer: PointerRow = { activeId: null, previousId: null };
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
  };
}
