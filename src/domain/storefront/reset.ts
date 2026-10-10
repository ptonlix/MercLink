export type ResetActor = "agent" | "admin";

export type ResetStatus = "pending" | "executed" | "rejected";

// An agent token must not be able to approve its own destructive reset.
export function resetExecutionAllowed(status: ResetStatus, actor: ResetActor): boolean {
  return actor === "admin" && status === "pending";
}
