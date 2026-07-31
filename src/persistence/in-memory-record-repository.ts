import type { MeetingRecord } from "../domain/meeting-record";

export class InMemoryRecordRepository {
  private readonly recordsByKey = new Map<string, MeetingRecord>();

  save(record: MeetingRecord): void {
    this.recordsByKey.set(this.keyFor(record), record);
  }

  countByCustomer(customerId: string): number {
    return this.list().filter((record) => record.customerId === customerId)
      .length;
  }

  countByScope(
    provider: MeetingRecord["provider"],
    customerId: string,
    transactionIds: readonly string[],
  ): number {
    const transactionIdSet = new Set(transactionIds);

    return this.list().filter(
      (record) =>
        record.provider === provider &&
        record.customerId === customerId &&
        transactionIdSet.has(record.transactionId),
    ).length;
  }

  count(): number {
    return this.recordsByKey.size;
  }

  list(): MeetingRecord[] {
    return [...this.recordsByKey.values()];
  }

  private keyFor(record: MeetingRecord): string {
    return `${record.provider}:${record.customerId}:${record.transactionId}`;
  }
}
