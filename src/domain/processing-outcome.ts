import type { Provider } from "./meeting-record";

export type ProcessingIdentity = {
  provider: Provider;
  customerId: string;
  transactionId: string;
};

export type ProcessingInput = ProcessingIdentity;

export function processingIdentityKey(identity: ProcessingIdentity): string {
  return JSON.stringify([
    identity.provider,
    identity.customerId,
    identity.transactionId,
  ]);
}

export type PersistedOutcome = ProcessingIdentity & {
  status: "persisted";
};

export type AlreadyExistingOutcome = ProcessingIdentity & {
  status: "already-exists";
};

export type RejectedOutcome = ProcessingIdentity & {
  status: "rejected";
  reason: string;
};

export type ConflictOutcome = ProcessingIdentity & {
  status: "conflict";
  reason: string;
};

export type ProcessingOutcome =
  PersistedOutcome | AlreadyExistingOutcome | RejectedOutcome | ConflictOutcome;
