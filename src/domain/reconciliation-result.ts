export type FulfilmentStatus =
  "PASS" | "MISSING" | "SURPLUS" | "CONFLICT" | "INVALID_EXPECTATION";

export type FulfilmentReconciliation = {
  customerId: string;
  providerReportedCount: number;
  persistedCount: number;
  correctCount: number;
  missingCount: number;
  unexpectedCount: number;
  conflictCount: number;
  invalidExpectationCount: number;
  duplicateExpectedIdentityCount: number;
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
