export type FulfilmentStatus = "PASS" | "MISSING" | "SURPLUS";

export type FulfilmentReconciliation = {
  customerId: string;
  providerReportedCount: number;
  persistedCount: number;
  missingCount: number;
  unexpectedCount: number;
  fulfilment: FulfilmentStatus;
};

export type AccountabilityStatus = "PASS" | "UNACCOUNTED" | "EXCESS_OUTCOMES";

export type PipelineAccountability = {
  receivedCount: number;
  persistedCount: number;
  rejectedCount: number;
  alreadyExistingCount: number;
  conflictCount: number;
  outcomeCount: number;
  unaccountedCount: number;
  excessOutcomeCount: number;
  accountability: AccountabilityStatus;
};
