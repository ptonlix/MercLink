export type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
};

export type ObjectStoragePort = {
  put: (input: { key: string; bytes: Uint8Array; contentType: string }) => Promise<void>;
  open: (key: string) => Promise<StoredObject | null>;
  delete: (key: string) => Promise<void>;
  headBucket: () => Promise<void>;
};
