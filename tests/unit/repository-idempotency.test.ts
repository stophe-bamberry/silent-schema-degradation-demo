import { describe, expect, it } from "vitest";
import type { MeetingRecord } from "../../src/domain/meeting-record";
import {
  InMemoryRecordRepository,
  recordKey,
} from "../../src/persistence/in-memory-record-repository";

const customerARecord: MeetingRecord = {
  provider: "example-provider",
  customerId: "customer-a",
  transactionId: "txn-shared-005",
  title: "Shared planning session",
};

const customerBRecord: MeetingRecord = {
  ...customerARecord,
  customerId: "customer-b",
};

describe("in-memory record repository identity", () => {
  it("generates a deterministic key from provider, customer, and transaction", () => {
    expect(recordKey(customerARecord)).toBe(
      '["example-provider","customer-a","txn-shared-005"]',
    );
    expect(recordKey(customerARecord)).toBe(recordKey({ ...customerARecord }));
  });

  it("does not collide when identity components contain separators", () => {
    const first = {
      ...customerARecord,
      customerId: "customer:a",
      transactionId: "txn",
    };
    const second = {
      ...customerARecord,
      customerId: "customer",
      transactionId: "a:txn",
    };

    expect(recordKey(first)).not.toBe(recordKey(second));
  });

  it("isolates customers that reuse the same transaction ID", () => {
    const repository = new InMemoryRecordRepository();

    expect(repository.save(customerARecord).status).toBe("created");
    expect(repository.save(customerBRecord).status).toBe("created");

    expect(repository.count()).toBe(2);
    expect(repository.countByCustomer("customer-a")).toBe(1);
    expect(repository.countByCustomer("customer-b")).toBe(1);
  });

  it("returns already-exists for an identical duplicate", () => {
    const repository = new InMemoryRecordRepository();

    expect(repository.save(customerARecord).status).toBe("created");
    expect(repository.save({ ...customerARecord })).toEqual({
      status: "already-exists",
      key: recordKey(customerARecord),
    });
    expect(repository.count()).toBe(1);
  });

  it("returns a conflict and preserves the original for different duplicate content", () => {
    const repository = new InMemoryRecordRepository();
    const conflictingRecord = {
      ...customerARecord,
      title: "Changed planning session",
    };

    repository.save(customerARecord);
    const result = repository.save(conflictingRecord);

    expect(result).toEqual({
      status: "conflict",
      key: recordKey(customerARecord),
      reason: "Canonical content differs for the existing business identity",
    });
    expect(repository.list()).toEqual([customerARecord]);
    expect(repository.count()).toBe(1);
  });
});
