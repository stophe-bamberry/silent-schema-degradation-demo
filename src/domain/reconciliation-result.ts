export type FulfilmentStatus = "PASS" | "MISSING" | "SURPLUS";

export type FulfilmentReconciliation = {
  customerId: string;
  providerReportedCount: number;
  persistedCount: number;
  missingCount: number;
  unexpectedCount: number;
  fulfilment: FulfilmentStatus;
};
