import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import type { HistoricalRecoveryProvider } from "../../src/pipeline/recovery-service";
import { RecoveryService } from "../../src/pipeline/recovery-service";
import type {
  ProviderBatch,
  ProviderExpectation,
} from "../../src/provider/provider-payload";
import { transformCompatible } from "../../src/provider/compatible-transformer";
import { StubProvider } from "../../src/provider/stub-provider";

describe("historical recovery", () => {
  it("creates all five expected records and proves recovery completion", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const report = new RecoveryService(provider, repository).recover();

    expect(report).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 5,
      alreadyCorrect: 0,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(report.outcomes).toHaveLength(5);
    expect(report.accountability).toMatchObject({
      receivedCount: 5,
      outcomeCount: 5,
      persistedCount: 5,
      accountability: "PASS",
    });
    expect(report.customerFulfilment).toMatchObject([
      { customerId: "customer-a", correctCount: 3, fulfilment: "PASS" },
      { customerId: "customer-b", correctCount: 2, fulfilment: "PASS" },
    ]);
  });

  it("creates zero records when the identical recovery is repeated", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const recovery = new RecoveryService(provider, repository);

    recovery.recover();
    const repeated = recovery.recover();

    expect(repeated).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 0,
      alreadyCorrect: 5,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(repeated.accountability).toMatchObject({
      alreadyExistingCount: 5,
      accountability: "PASS",
    });
  });

  it("completes a partial recovery and then creates zero records on retry", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const historicalRecords = provider
      .getHistoricalIncidentBatches()
      .flatMap((batch) => [...batch.records]);

    for (const payload of historicalRecords.slice(0, 2)) {
      const transformation = transformCompatible(payload);

      if (transformation.status !== "transformed") {
        throw new Error("Historical fixture should be compatible");
      }

      expect(repository.save(transformation.record).status).toBe("created");
    }

    const recovery = new RecoveryService(provider, repository);
    const firstRetry = recovery.recover();
    const secondRetry = recovery.recover();

    expect(firstRetry).toMatchObject({
      recordsCreated: 3,
      alreadyCorrect: 2,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(secondRetry).toMatchObject({
      recordsCreated: 0,
      alreadyCorrect: 5,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(repository.count()).toBe(5);
  });

  it("counts only correct incident records when unrelated baselines exist", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);

    ingestion.ingestCompatible([
      ...provider.getBaselineBatch("customer-a").records,
      ...provider.getBaselineBatch("customer-b").records,
    ]);

    const report = new RecoveryService(provider, repository).recover();

    expect(report.correctIncidentRecords).toBe(5);
    expect(report.recoveryComplete).toBe(true);
    expect(repository.count()).toBe(9);
    expect(repository.countByCustomer("customer-a")).toBe(5);
    expect(repository.countByCustomer("customer-b")).toBe(4);
  });

  it("does not declare recovery complete when existing content conflicts", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const expectedRecord =
      provider.getIncidentExpectation("customer-a").expectedRecords[0];
    const conflictingRecord = { ...expectedRecord, title: "Wrong title" };

    repository.save(conflictingRecord);
    const report = new RecoveryService(provider, repository).recover();

    expect(report).toMatchObject({
      historicalRecordsRetrieved: 5,
      recordsCreated: 4,
      alreadyCorrect: 0,
      rejected: 0,
      conflicts: 1,
      correctIncidentRecords: 4,
      recoveryComplete: false,
    });
    expect(report.accountability).toMatchObject({
      conflictCount: 1,
      accountability: "PASS",
    });
    expect(report.customerFulfilment[0]).toMatchObject({
      customerId: "customer-a",
      persistedCount: 3,
      correctCount: 2,
      conflictCount: 1,
      fulfilment: "CONFLICT",
    });
    expect(repository.find(expectedRecord)).toEqual(conflictingRecord);
  });

  it("continues after malformed history and reports every input outcome", () => {
    const provider = new StubProvider();
    const batches = provider.getHistoricalIncidentBatches();
    const customerA = batches[0];
    const malformedRecords = customerA.records.map((record, index) =>
      index === 1 && typeof record === "object" && record !== null
        ? { ...record, title: "" }
        : record,
    );
    const source = withHistoricalBatches(provider, [
      { ...customerA, records: malformedRecords },
      batches[1],
    ]);
    const repository = new InMemoryRecordRepository();

    const report = new RecoveryService(source, repository).recover();

    expect(report).toMatchObject({
      historicalRecordsRetrieved: 5,
      recordsCreated: 4,
      alreadyCorrect: 0,
      rejected: 1,
      conflicts: 0,
      correctIncidentRecords: 4,
      recoveryComplete: false,
    });
    expect(report.outcomes).toHaveLength(5);
    expect(report.outcomes.map((outcome) => outcome.status)).toEqual([
      "persisted",
      "rejected",
      "persisted",
      "persisted",
      "persisted",
    ]);
    expect(report.accountability).toMatchObject({
      receivedCount: 5,
      outcomeCount: 5,
      rejectedCount: 1,
      accountability: "PASS",
    });
    expect(repository.count()).toBe(4);
  });

  it("detects a missing replay payload independently and recovers it on retry", () => {
    const provider = new StubProvider();
    const batches = provider.getHistoricalIncidentBatches();
    const customerA = batches[0];
    const incompleteSource = withHistoricalBatches(provider, [
      {
        ...customerA,
        records: customerA.records.filter(
          (record) =>
            typeof record === "object" &&
            record !== null &&
            "transactionId" in record &&
            record.transactionId !== "txn-a-006",
        ),
      },
      batches[1],
    ]);
    const repository = new InMemoryRecordRepository();

    const incomplete = new RecoveryService(
      incompleteSource,
      repository,
    ).recover();

    expect(incomplete).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 4,
      recordsCreated: 4,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 4,
      expectedButNotRetrievedCount: 1,
      unexpectedRetrievedCount: 0,
      recoveryComplete: false,
    });
    expect(incomplete.accountability).toMatchObject({
      receivedCount: 4,
      outcomeCount: 4,
      accountability: "PASS",
    });
    expect(incomplete.customerFulfilment[0]).toMatchObject({
      customerId: "customer-a",
      missingCount: 1,
      fulfilment: "MISSING",
    });

    const completed = new RecoveryService(provider, repository).recover();
    const repeated = new RecoveryService(provider, repository).recover();

    expect(completed).toMatchObject({
      recordsCreated: 1,
      alreadyCorrect: 4,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(repeated).toMatchObject({
      recordsCreated: 0,
      alreadyCorrect: 5,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
  });

  it("does not let an unexpected identity replace a missing expected record", () => {
    const provider = new StubProvider();
    const batches = provider.getHistoricalIncidentBatches();
    const customerA = batches[0];
    const substitutedRecords = customerA.records.map((record) =>
      typeof record === "object" &&
      record !== null &&
      "transactionId" in record &&
      record.transactionId === "txn-a-006"
        ? {
            transactionId: "txn-a-unexpected",
            customerId: "customer-a",
            title: "Unexpected record",
          }
        : record,
    );
    const source = withHistoricalBatches(provider, [
      { ...customerA, records: substitutedRecords },
      batches[1],
    ]);

    const report = new RecoveryService(
      source,
      new InMemoryRecordRepository(),
    ).recover();

    expect(report).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 4,
      rejected: 1,
      correctIncidentRecords: 4,
      expectedButNotRetrievedCount: 1,
      unexpectedRetrievedCount: 1,
      recoveryComplete: false,
    });
    expect(report.accountability.accountability).toBe("PASS");
    expect(
      report.outcomes.find(
        (outcome) => outcome.transactionId === "txn-a-unexpected",
      ),
    ).toMatchObject({
      status: "rejected",
      reason: "Payload identity is outside the expected recovery inventory",
    });
    expect(report.customerFulfilment[0]).toMatchObject({
      missingCount: 1,
      fulfilment: "MISSING",
    });
  });

  it("rejects wrong replay content before persistence and permits a corrected retry", () => {
    const provider = new StubProvider();
    const batches = provider.getHistoricalIncidentBatches();
    const customerA = batches[0];
    const wrongContentRecords = customerA.records.map((record) =>
      typeof record === "object" &&
      record !== null &&
      "transactionId" in record &&
      record.transactionId === "txn-a-004"
        ? { ...record, title: "Wrong provider content" }
        : record,
    );
    const source = withHistoricalBatches(provider, [
      { ...customerA, records: wrongContentRecords },
      batches[1],
    ]);
    const repository = new InMemoryRecordRepository();

    const rejected = new RecoveryService(source, repository).recover();

    expect(rejected).toMatchObject({
      recordsCreated: 4,
      rejected: 1,
      correctIncidentRecords: 4,
      recoveryComplete: false,
    });
    expect(
      rejected.outcomes.find(
        (outcome) => outcome.transactionId === "txn-a-004",
      ),
    ).toMatchObject({
      status: "rejected",
      reason:
        "Canonical content does not match the expected recovery inventory",
    });
    expect(repository.count()).toBe(4);

    const corrected = new RecoveryService(provider, repository).recover();

    expect(corrected).toMatchObject({
      recordsCreated: 1,
      alreadyCorrect: 4,
      rejected: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
  });

  it("rejects expectations whose records are scoped to another customer", () => {
    const provider = new StubProvider();
    const expectations = provider.getHistoricalIncidentExpectations();
    const swappedExpectations = [
      {
        ...expectations[0],
        expectedRecords: expectations[1].expectedRecords,
      },
      {
        ...expectations[1],
        expectedRecords: expectations[0].expectedRecords,
      },
    ];
    const repository = new InMemoryRecordRepository();
    const source = withRecoveryData(
      provider.getHistoricalIncidentBatches(),
      swappedExpectations,
    );

    const report = new RecoveryService(source, repository).recover();

    expect(report).toMatchObject({
      recordsCreated: 0,
      rejected: 5,
      invalidExpectationCount: 5,
      correctIncidentRecords: 0,
      recoveryComplete: false,
    });
    expect(report.customerFulfilment).toMatchObject([
      { invalidExpectationCount: 2, fulfilment: "INVALID_EXPECTATION" },
      { invalidExpectationCount: 3, fulfilment: "INVALID_EXPECTATION" },
    ]);
    expect(repository.count()).toBe(0);
  });

  it("rejects duplicate identities in the expected inventory", () => {
    const provider = new StubProvider();
    const expectations = provider.getHistoricalIncidentExpectations();
    const batches = provider.getHistoricalIncidentBatches();
    const duplicateExpectations = [
      {
        ...expectations[0],
        expectedRecords: [
          expectations[0].expectedRecords[0],
          expectations[0].expectedRecords[0],
          expectations[0].expectedRecords[2],
        ],
      },
      expectations[1],
    ];
    const duplicateBatches = [
      {
        ...batches[0],
        records: [
          batches[0].records[0],
          batches[0].records[0],
          batches[0].records[2],
        ],
      },
      batches[1],
    ];

    const report = new RecoveryService(
      withRecoveryData(duplicateBatches, duplicateExpectations),
      new InMemoryRecordRepository(),
    ).recover();

    expect(report).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 4,
      alreadyCorrect: 1,
      duplicateExpectedIdentityCount: 1,
      correctIncidentRecords: 4,
      recoveryComplete: false,
    });
    expect(report.customerFulfilment[0]).toMatchObject({
      duplicateExpectedIdentityCount: 1,
      fulfilment: "INVALID_EXPECTATION",
    });
  });

  it("allows overlapping replay delivery when every unique identity is expected", () => {
    const provider = new StubProvider();
    const batches = provider.getHistoricalIncidentBatches();
    const overlappingSource = withHistoricalBatches(provider, [
      {
        ...batches[0],
        records: [...batches[0].records, batches[0].records[0]],
      },
      batches[1],
    ]);

    const report = new RecoveryService(
      overlappingSource,
      new InMemoryRecordRepository(),
    ).recover();

    expect(report).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 6,
      recordsCreated: 5,
      alreadyCorrect: 1,
      expectedButNotRetrievedCount: 0,
      unexpectedRetrievedCount: 0,
      duplicateExpectedIdentityCount: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
  });

  it("rejects a non-empty provider claim without a matching expectation", () => {
    const provider = new StubProvider();
    const unmatchedBatch: ProviderBatch<unknown> = {
      provider: "example-provider",
      customerId: "customer-c",
      reportedRecordCount: 1,
      records: [],
    };
    const source = withHistoricalBatches(provider, [
      ...provider.getHistoricalIncidentBatches(),
      unmatchedBatch,
    ]);

    const report = new RecoveryService(
      source,
      new InMemoryRecordRepository(),
    ).recover();

    expect(report).toMatchObject({
      invalidBatchCount: 1,
      correctIncidentRecords: 5,
      recoveryComplete: false,
    });
  });

  it("rejects an unmatched empty provider claim", () => {
    const provider = new StubProvider();
    const unmatchedBatch: ProviderBatch<unknown> = {
      provider: "example-provider",
      customerId: "customer-c",
      reportedRecordCount: 0,
      records: [],
    };
    const source = withHistoricalBatches(provider, [
      ...provider.getHistoricalIncidentBatches(),
      unmatchedBatch,
    ]);

    const report = new RecoveryService(
      source,
      new InMemoryRecordRepository(),
    ).recover();

    expect(report).toMatchObject({
      invalidBatchCount: 1,
      correctIncidentRecords: 5,
      recoveryComplete: false,
    });
  });
});

function withHistoricalBatches(
  provider: StubProvider,
  batches: readonly ProviderBatch<unknown>[],
): HistoricalRecoveryProvider {
  return withRecoveryData(
    batches,
    provider.getHistoricalIncidentExpectations(),
  );
}

function withRecoveryData(
  batches: readonly ProviderBatch<unknown>[],
  expectations: readonly ProviderExpectation[],
): HistoricalRecoveryProvider {
  return {
    getHistoricalIncidentBatches: () => batches,
    getHistoricalIncidentExpectations: () => expectations,
  };
}
