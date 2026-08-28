import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { StubProvider } from "../../src/provider/stub-provider";

describe("validated ingestion", () => {
  it("accounts for every incident input while fulfilment still fails", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();
    const customerABatch = provider.getIncidentBatch("customer-a");
    const customerBBatch = provider.getIncidentBatch("customer-b");
    const receivedRecords = [
      ...customerABatch.records,
      ...customerBBatch.records,
    ];
    const receivedInputs = ingestion.identifyInputs(receivedRecords);
    const outcomes = ingestion.ingestValidated(receivedRecords);

    expect(receivedInputs).toHaveLength(5);
    expect(outcomes).toHaveLength(5);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(
      true,
    );
    expect(repository.count()).toBe(0);
    expect(
      reconciliation.reconcileAccountability(receivedInputs, outcomes),
    ).toEqual({
      receivedCount: 5,
      persistedCount: 0,
      rejectedCount: 5,
      alreadyExistingCount: 0,
      conflictCount: 0,
      outcomeCount: 5,
      unaccountedCount: 0,
      excessOutcomeCount: 0,
      accountability: "PASS",
    });
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ).fulfilment,
    ).toBe("MISSING");
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-b"),
        repository,
      ).fulfilment,
    ).toBe("MISSING");
  });
});

describe("schema-compatible ingestion", () => {
  it("persists fresh version 2 records for both customers with no rejections", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();
    const customerABatch = provider.getIncidentBatch("customer-a");
    const customerBBatch = provider.getIncidentBatch("customer-b");
    const receivedRecords = [
      ...customerABatch.records,
      ...customerBBatch.records,
    ];
    const receivedInputs = ingestion.identifyInputs(receivedRecords);
    const outcomes = ingestion.ingestCompatible(receivedRecords);

    expect(outcomes).toHaveLength(5);
    expect(outcomes.every((outcome) => outcome.status === "persisted")).toBe(
      true,
    );
    expect(repository.countByCustomer("customer-a")).toBe(3);
    expect(repository.countByCustomer("customer-b")).toBe(2);
    expect(
      reconciliation.reconcileAccountability(receivedInputs, outcomes),
    ).toEqual({
      receivedCount: 5,
      persistedCount: 5,
      rejectedCount: 0,
      alreadyExistingCount: 0,
      conflictCount: 0,
      outcomeCount: 5,
      unaccountedCount: 0,
      excessOutcomeCount: 0,
      accountability: "PASS",
    });
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ).fulfilment,
    ).toBe("PASS");
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-b"),
        repository,
      ).fulfilment,
    ).toBe("PASS");
  });

  it("rejects a payload routed under the wrong customer envelope", () => {
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const outcomes = ingestion.ingestCompatibleBatch({
      provider: "example-provider",
      customerId: "customer-a",
      reportedRecordCount: 1,
      records: [
        {
          transactionId: "txn-cross-tenant",
          customerId: "customer-b",
          title: "Misrouted record",
        },
      ],
    });

    expect(outcomes).toEqual([
      {
        provider: "example-provider",
        customerId: "customer-b",
        transactionId: "txn-cross-tenant",
        status: "rejected",
        reason:
          "Payload customer customer-b does not match batch customer customer-a",
      },
    ]);
    expect(repository.count()).toBe(0);
  });
});

describe("persistence outcomes through ingestion", () => {
  it("reports created, duplicate, and conflict outcomes honestly", () => {
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();
    const firstPayload = {
      transactionId: "txn-a-004",
      customerId: "customer-a",
      title: "Quarterly review",
    };
    const duplicatePayload = { ...firstPayload };
    const conflictingPayload = {
      ...firstPayload,
      title: "Changed quarterly review",
    };
    const payloads = [firstPayload, duplicatePayload, conflictingPayload];
    const outcomes = ingestion.ingestCompatible(payloads);
    const receivedInputs = ingestion.identifyInputs(payloads);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "persisted",
      "already-exists",
      "conflict",
    ]);
    expect(outcomes[2]).toMatchObject({
      provider: "example-provider",
      customerId: "customer-a",
      transactionId: "txn-a-004",
      reason: "Canonical content differs for the existing business identity",
    });
    expect(repository.list()).toEqual([
      {
        provider: "example-provider",
        customerId: "customer-a",
        transactionId: "txn-a-004",
        title: "Quarterly review",
      },
    ]);
    expect(
      reconciliation.reconcileAccountability(receivedInputs, outcomes),
    ).toEqual({
      receivedCount: 3,
      persistedCount: 1,
      rejectedCount: 0,
      alreadyExistingCount: 1,
      conflictCount: 1,
      outcomeCount: 3,
      unaccountedCount: 0,
      excessOutcomeCount: 0,
      accountability: "PASS",
    });
  });

  it("does not report fulfilment as complete when the scoped records are absent", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();
    const unrelatedPayload = {
      transactionId: "txn-a-outside-window",
      customerId: "customer-a",
      title: "Unrelated record",
    };

    ingestion.ingestCompatible([unrelatedPayload]);

    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ),
    ).toMatchObject({
      persistedCount: 0,
      missingCount: 3,
      fulfilment: "MISSING",
    });
  });
});
