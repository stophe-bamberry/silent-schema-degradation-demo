export const PROVIDER = "example-provider" as const;

export type Provider = typeof PROVIDER;

export type MeetingRecord = {
  provider: Provider;
  customerId: string;
  transactionId: string;
  title: string;
};
