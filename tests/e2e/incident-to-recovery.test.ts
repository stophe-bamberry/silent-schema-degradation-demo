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
        provider.getIncidentExpectation("customer-a"),
        incidentRepository,
      ),
    ).toEqual({
      customerId: "customer-a",
      providerReportedCount: 3,
      persistedCount: 0,
      correctCount: 0,
      missingCount: 3,
      unexpectedCount: 0,
      conflictCount: 0,
      invalidExpectationCount: 0,
      duplicateExpectedIdentityCount: 0,
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
        correctCount: 0,
        missingCount: 3,
        unexpectedCount: 0,
        conflictCount: 0,
        invalidExpectationCount: 0,
        duplicateExpectedIdentityCount: 0,
        fulfilment: "MISSING",
      },
      {
        customerId: "customer-b",
        providerReportedCount: 2,
        persistedCount: 0,
        correctCount: 0,
        missingCount: 2,
        unexpectedCount: 0,
        conflictCount: 0,
        invalidExpectationCount: 0,
        duplicateExpectedIdentityCount: 0,
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
        provider.getIncidentExpectation("customer-a"),
        forwardRepository,
      ).fulfilment,
    ).toBe("PASS");
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-b"),
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

    expect(firstRecovery).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 5,
      alreadyCorrect: 0,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(firstRecovery.outcomes).toHaveLength(5);
    expect(firstRecovery.accountability).toMatchObject({
      persistedCount: 5,
      accountability: "PASS",
    });
    expect(secondRecovery).toMatchObject({
      historicalRecordsExpected: 5,
      historicalRecordsRetrieved: 5,
      recordsCreated: 0,
      alreadyCorrect: 5,
      rejected: 0,
      conflicts: 0,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(secondRecovery.accountability).toMatchObject({
      alreadyExistingCount: 5,
      accountability: "PASS",
    });

    expect(
      historicalRepository
        .list()
        .filter((record) => record.transactionId === "txn-shared-005"),
    ).toHaveLength(2);
    expect(historicalRepository.count()).toBe(5);
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        historicalRepository,
      ),
    ).toEqual({
      customerId: "customer-a",
      providerReportedCount: 3,
      persistedCount: 3,
      correctCount: 3,
      missingCount: 0,
      unexpectedCount: 0,
      conflictCount: 0,
      invalidExpectationCount: 0,
      duplicateExpectedIdentityCount: 0,
      fulfilment: "PASS",
    });
    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-b"),
        historicalRepository,
      ),
    ).toEqual({
      customerId: "customer-b",
      providerReportedCount: 2,
      persistedCount: 2,
      correctCount: 2,
      missingCount: 0,
      unexpectedCount: 0,
      conflictCount: 0,
      invalidExpectationCount: 0,
      duplicateExpectedIdentityCount: 0,
      fulfilment: "PASS",
    });
  });

  it("recovers the silently dropped window in the same repository", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const legacyIngestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();

    legacyIngestion.ingestLegacy(provider.getIncidentBatch("customer-a"));
    legacyIngestion.ingestLegacy(provider.getIncidentBatch("customer-b"));

    expect(repository.count()).toBe(0);
    expect(
      reconciliation
        .reconcileActiveCustomers(provider, repository)
        .map((result) => result.fulfilment),
    ).toEqual(["MISSING", "MISSING"]);

    const firstRecovery = new RecoveryService(provider, repository).recover();
    const repeatedRecovery = new RecoveryService(
      provider,
      repository,
    ).recover();

    expect(firstRecovery).toMatchObject({
      recordsCreated: 5,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(firstRecovery.accountability.accountability).toBe("PASS");
    expect(repeatedRecovery).toMatchObject({
      recordsCreated: 0,
      alreadyCorrect: 5,
      correctIncidentRecords: 5,
      recoveryComplete: true,
    });
    expect(repository.count()).toBe(5);
  });
});
