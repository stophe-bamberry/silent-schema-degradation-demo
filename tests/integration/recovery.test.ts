import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { RecoveryService } from "../../src/pipeline/recovery-service";
import { transformCompatible } from "../../src/provider/compatible-transformer";
import { StubProvider } from "../../src/provider/stub-provider";

describe("historical recovery", () => {
  it("creates all five incident records on the first recovery", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const recovery = new RecoveryService(provider, repository);

    expect(recovery.recover()).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 5,
      alreadyExisting: 0,
      conflicts: 0,
      uniqueIncidentRecords: 5,
    });
  });

  it("creates zero records when the identical recovery is repeated", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const recovery = new RecoveryService(provider, repository);

    recovery.recover();

    expect(recovery.recover()).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 0,
      alreadyExisting: 5,
      conflicts: 0,
      uniqueIncidentRecords: 5,
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

    expect(firstRetry).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 3,
      alreadyExisting: 2,
      conflicts: 0,
      uniqueIncidentRecords: 5,
    });
    expect(secondRetry).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 0,
      alreadyExisting: 5,
      conflicts: 0,
      uniqueIncidentRecords: 5,
    });
    expect(repository.count()).toBe(5);
  });

  it("counts only incident records when unrelated baselines already exist", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();

    ingestion.ingestCompatible([
      ...provider.getBaselineBatch("customer-a").records,
      ...provider.getBaselineBatch("customer-b").records,
    ]);

    const recovery = new RecoveryService(provider, repository);
    const summary = recovery.recover();

    expect(summary.uniqueIncidentRecords).toBe(5);
    expect(repository.count()).toBe(9);
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentBatch("customer-a"),
        repository,
      ).fulfilment,
    ).toBe("PASS");
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentBatch("customer-b"),
        repository,
      ).fulfilment,
    ).toBe("PASS");
    expect(repository.countByCustomer("customer-a")).toBe(5);
    expect(repository.countByCustomer("customer-b")).toBe(4);
  });
});
