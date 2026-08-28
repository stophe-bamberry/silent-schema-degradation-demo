export const PROVIDER = "example-provider" as const;

export type Provider = typeof PROVIDER;

export type MeetingRecord = {
  provider: Provider;
  customerId: string;
  transactionId: string;
  title: string;
};

export function sameMeetingRecord(
  left: MeetingRecord,
  right: MeetingRecord,
): boolean {
  return (
    left.provider === right.provider &&
    left.customerId === right.customerId &&
    left.transactionId === right.transactionId &&
    left.title === right.title
  );
}
