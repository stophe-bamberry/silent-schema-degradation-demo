import type { Provider } from "../domain/meeting-record";

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

export type ProviderBatch = {
  provider: Provider;
  customerId: string;
  reportedRecordCount: number;
  records: readonly ProviderPayload[];
};
