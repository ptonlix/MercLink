export type ReleasePointer = {
  activeId: string | null;
  previousId: string | null;
};

export function activationConfirmed(confirm: unknown): boolean {
  return confirm === true;
}

export function pointerAfterActivate(current: ReleasePointer, releaseId: string): ReleasePointer {
  return { activeId: releaseId, previousId: current.activeId };
}

export function pointerAfterRollback(current: ReleasePointer): ReleasePointer {
  return { activeId: current.previousId, previousId: null };
}
