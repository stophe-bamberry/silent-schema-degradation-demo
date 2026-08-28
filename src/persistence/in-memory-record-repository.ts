import {
  sameMeetingRecord,
  type MeetingRecord,
} from "../domain/meeting-record";
import {
  processingIdentityKey,
  type ProcessingIdentity,
} from "../domain/processing-outcome";

export type PersistenceResult =
  | { status: "created"; key: string }
  | { status: "already-exists"; key: string }
  | { status: "conflict"; key: string; reason: string };

export function recordKey(record: ProcessingIdentity): string {
  return processingIdentityKey(record);
}

export class InMemoryRecordRepository {
  private readonly recordsByKey = new Map<string, MeetingRecord>();

  save(record: MeetingRecord): PersistenceResult {
    const key = recordKey(record);
    const existing = this.recordsByKey.get(key);

    if (existing === undefined) {
      this.recordsByKey.set(key, record);
      return { status: "created", key };
    }

    if (sameMeetingRecord(existing, record)) {
      return { status: "already-exists", key };
    }

    return {
      status: "conflict",
      key,
      reason: "Canonical content differs for the existing business identity",
    };
  }

  countByCustomer(customerId: string): number {
    return this.list().filter((record) => record.customerId === customerId)
      .length;
  }

  count(): number {
    return this.recordsByKey.size;
  }

  find(identity: ProcessingIdentity): MeetingRecord | undefined {
    return this.recordsByKey.get(recordKey(identity));
  }

  containsExact(record: MeetingRecord): boolean {
    const existing = this.find(record);
    return existing !== undefined && sameMeetingRecord(existing, record);
  }

  list(): MeetingRecord[] {
    return [...this.recordsByKey.values()];
  }
}
