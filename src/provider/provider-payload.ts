import type { MeetingRecord, Provider } from "../domain/meeting-record";

export type ProviderPayloadV1 = {
  transactionId: string;
  customerId: string;
  meetingTitle: string;
};

export type ProviderPayloadV2 = {
  transactionId: string;
  customerId: string;
  title: string;
};

export type ProviderPayload = ProviderPayloadV1 | ProviderPayloadV2;

export type ProviderBatch<TPayload = ProviderPayload> = {
  provider: Provider;
  customerId: string;
  reportedRecordCount: number;
  records: readonly TPayload[];
};

/**
 * An independently obtained statement of what the provider says should exist
 * for one customer in the incident scope. The demo keeps this separate from
 * replay payload retrieval so a missing payload cannot disappear from both
 * sides of reconciliation.
 */
export type ProviderExpectation = {
  provider: Provider;
  customerId: string;
  reportedRecordCount: number;
  expectedRecords: readonly MeetingRecord[];
};
