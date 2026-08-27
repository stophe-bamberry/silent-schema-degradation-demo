import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { RecoveryService } from "../../src/pipeline/recovery-service";
import { StubProvider } from "../../src/provider/stub-provider";

describe("incident to recovery", () => {
  it("proves the full failure-detection-remediation-recovery sequence", () => {
    const provider = new StubProvider();
    const reconciliation = new ReconciliationService();
    const customerABaselineBatch = provider.getBaselineBatch("customer-a");
    const customerBBaselineBatch = provider.getBaselineBatch("customer-b");
    const customerAIncidentBatch = provider.getIncidentBatch("customer-a");
    const customerBIncidentBatch = provider.getIncidentBatch("customer-b");

    const baselineRepository = new InMemoryRecordRepository();
    const baselineIngestion = new IngestionService(baselineRepository);
    baselineIngestion.ingestLegacy(customerABaselineBatch);
    baselineIngestion.ingestLegacy(customerBBaselineBatch);

    expect(baselineRepository.countByCustomer("customer-a")).toBe(2);
    expect(baselineRepository.countByCustomer("customer-b")).toBe(2);

    const incidentRepository = new InMemoryRecordRepository();
    const legacyIngestion = new IngestionService(incidentRepository);

    expect(() =>
      legacyIngestion.ingestLegacy(customerAIncidentBatch),
    ).not.toThrow();
    expect(incidentRepository.countByCustomer("customer-a")).toBe(0);
    expect(
      reconciliation.reconcileCustomer(
        customerAIncidentBatch,
        incidentRepository,
      ),
    ).toEqual({
      customerId: "customer-a",
      providerReportedCount: 3,
      persistedCount: 0,
      missingCount: 3,
      unexpectedCount: 0,
      fulfilment: "MISSING",
    });

    legacyIngestion.ingestLegacy(customerBIncidentBatch);
    const sweep = reconciliation.reconcileActiveCustomers(
      provider,
      incidentRepository,
    );
    expect(sweep).toEqual([
      {
        customerId: "customer-a",
        providerReportedCount: 3,
        persistedCount: 0,
        missingCount: 3,
        unexpectedCount: 0,
        fulfilment: "MISSING",
      },
      {
        customerId: "customer-b",
        providerReportedCount: 2,
        persistedCount: 0,
        missingCount: 2,
        unexpectedCount: 0,
        fulfilment: "MISSING",
      },
    ]);

    const validationRepository = new InMemoryRecordRepository();
    const validationIngestion = new IngestionService(validationRepository);
    const failedInputs = [
      ...customerAIncidentBatch.records,
      ...customerBIncidentBatch.records,
    ];
    const failedReceivedInputs =
      validationIngestion.identifyInputs(failedInputs);
    const rejectedOutcomes = validationIngestion.ingestValidated(failedInputs);

    expect(rejectedOutcomes).toHaveLength(5);
    expect(
      rejectedOutcomes.every((outcome) => outcome.status === "rejected"),
    ).toBe(true);
    expect(
      reconciliation.reconcileAccountability(
        failedReceivedInputs,
        rejectedOutcomes,
      ),
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

    const versionOneRepository = new InMemoryRecordRepository();
    const versionOneIngestion = new IngestionService(versionOneRepository);
    const versionOneOutcomes = versionOneIngestion.ingestCompatible([
      ...customerABaselineBatch.records,
      ...customerBBaselineBatch.records,
    ]);
    expect(
      versionOneOutcomes.every((outcome) => outcome.status === "persisted"),
    ).toBe(true);
    expect(versionOneRepository.count()).toBe(4);

    const forwardRepository = new InMemoryRecordRepository();
    const forwardIngestion = new IngestionService(forwardRepository);
    const forwardReceivedInputs = forwardIngestion.identifyInputs(failedInputs);
    const forwardOutcomes = forwardIngestion.ingestCompatible(failedInputs);
    expect(forwardOutcomes).toHaveLength(5);
    expect(
      forwardOutcomes.every((outcome) => outcome.status === "persisted"),
    ).toBe(true);
    expect(
      reconciliation.reconcileCustomer(
        customerAIncidentBatch,
        forwardRepository,
      ).fulfilment,
    ).toBe("PASS");
    expect(
      reconciliation.reconcileCustomer(
        customerBIncidentBatch,
        forwardRepository,
      ).fulfilment,
    ).toBe("PASS");
    expect(
      reconciliation.reconcileAccountability(
        forwardReceivedInputs,
        forwardOutcomes,
      ),
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

    const historicalRepository = new InMemoryRecordRepository();
    const recovery = new RecoveryService(provider, historicalRepository);
    const firstRecovery = recovery.recover();
    const secondRecovery = recovery.recover();

    expect(firstRecovery).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 5,
      alreadyExisting: 0,
      conflicts: 0,
      uniqueIncidentRecords: 5,
    });
    expect(secondRecovery).toEqual({
      historicalRecordsRetrieved: 5,
      recordsCreated: 0,
      alreadyExisting: 5,
      conflicts: 0,
      uniqueIncidentRecords: 5,
    });

    expect(
      historicalRepository
        .list()
        .filter((record) => record.transactionId === "txn-shared-005"),
    ).toHaveLength(2);
    expect(historicalRepository.count()).toBe(5);
    expect(
      reconciliation.reconcileCustomer(
        customerAIncidentBatch,
        historicalRepository,
      ),
    ).toEqual({
      customerId: "customer-a",
      providerReportedCount: 3,
      persistedCount: 3,
      missingCount: 0,
      unexpectedCount: 0,
      fulfilment: "PASS",
    });
    expect(
      reconciliation.reconcileCustomer(
        customerBIncidentBatch,
        historicalRepository,
      ),
    ).toEqual({
      customerId: "customer-b",
      providerReportedCount: 2,
      persistedCount: 2,
      missingCount: 0,
      unexpectedCount: 0,
      fulfilment: "PASS",
    });
  });
});
