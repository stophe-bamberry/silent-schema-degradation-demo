import type { MeetingRecord } from "../domain/meeting-record";

export type PersistenceResult =
  | { status: "created"; key: string }
  | { status: "already-exists"; key: string }
  | { status: "conflict"; key: string; reason: string };

export type RecordScope = {
  provider: MeetingRecord["provider"];
  customerId: string;
  transactionIds: readonly string[];
};

export function recordKey(record: MeetingRecord): string {
  return `${record.provider}:${record.customerId}:${record.transactionId}`;
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

    if (this.hasIdenticalContent(existing, record)) {
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

  countWithinScope(scope: RecordScope): number {
    return this.countByScope(
      scope.provider,
      scope.customerId,
      scope.transactionIds,
    );
  }

  count(): number {
    return this.recordsByKey.size;
  }

  list(): MeetingRecord[] {
    return [...this.recordsByKey.values()];
  }

  private hasIdenticalContent(
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
}
