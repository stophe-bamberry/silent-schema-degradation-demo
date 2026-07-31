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
