import { describe, expect, it } from "vitest";
import { PROVIDER } from "../../src/domain/meeting-record";
import type { MeetingRecord } from "../../src/domain/meeting-record";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { transformLegacy } from "../../src/provider/legacy-transformer";
import { StubProvider } from "../../src/provider/stub-provider";
import { customerABaselineV1 } from "../fixtures/customer-a";

describe("content-correct customer fulfilment reconciliation", () => {
  it("detects Customer A missing exactly three independently expected records", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();

    ingestion.ingestLegacy(provider.getIncidentBatch("customer-a"));

    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
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
  });

  it("discovers Customer B through the active expectation sweep", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);

    for (const customerId of ["customer-a", "customer-b"] as const) {
      ingestion.ingestLegacy(provider.getIncidentBatch(customerId));
    }

    expect(
      new ReconciliationService().reconcileActiveCustomers(
        provider,
        repository,
      ),
    ).toEqual([
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
  });

  it("keeps provider count independent from the expected identity manifest", () => {
    const provider = new StubProvider();
    const expectation = {
      ...provider.getIncidentExpectation("customer-a"),
      reportedRecordCount: 4,
    };

    expect(
      new ReconciliationService().reconcileCustomer(
        expectation,
        new InMemoryRecordRepository(),
      ),
    ).toMatchObject({
      providerReportedCount: 4,
      persistedCount: 0,
      correctCount: 0,
      missingCount: 4,
      unexpectedCount: 0,
      fulfilment: "MISSING",
    });
  });

  it("counts only exact canonical content as correct", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const reconciliation = new ReconciliationService();
    const expectation = provider.getIncidentExpectation("customer-a");

    const beforePersistence = reconciliation.reconcileCustomer(
      expectation,
      repository,
    );
    repository.save(expectation.expectedRecords[0]);
    const afterPersistence = reconciliation.reconcileCustomer(
      expectation,
      repository,
    );

    expect(beforePersistence).toMatchObject({
      persistedCount: 0,
      correctCount: 0,
      missingCount: 3,
    });
    expect(afterPersistence).toMatchObject({
      persistedCount: 1,
      correctCount: 1,
      missingCount: 2,
      conflictCount: 0,
    });
  });

  it("reports wrong canonical content as a conflict rather than fulfilment", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const expectation = provider.getIncidentExpectation("customer-a");

    repository.save({
      ...expectation.expectedRecords[0],
      title: "Wrong title",
    });

    expect(
      new ReconciliationService().reconcileCustomer(expectation, repository),
    ).toMatchObject({
      persistedCount: 1,
      correctCount: 0,
      missingCount: 2,
      conflictCount: 1,
      fulfilment: "CONFLICT",
    });
  });

  it("does not count pre-existing baseline records for the incident scope", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const baselineRecord = transformLegacy(customerABaselineV1[0]);

    if (baselineRecord === undefined) {
      throw new Error("The v1 fixture should transform into a record");
    }

    repository.save(baselineRecord);

    expect(
      new ReconciliationService().reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ),
    ).toMatchObject({
      persistedCount: 0,
      correctCount: 0,
      missingCount: 3,
      fulfilment: "MISSING",
    });
  });

  it("ignores a record outside the incident expectation", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();

    repository.save({
      provider: PROVIDER,
      customerId: "customer-a",
      transactionId: "txn-a-outside-window",
      title: "Outside incident window",
    });

    expect(
      new ReconciliationService().reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ).persistedCount,
    ).toBe(0);
  });

  it("does not count the same transaction ID under another customer", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();

    repository.save({
      provider: PROVIDER,
      customerId: "customer-b",
      transactionId: "txn-shared-005",
      title: "Shared planning session",
    });

    expect(
      new ReconciliationService().reconcileCustomer(
        provider.getIncidentExpectation("customer-a"),
        repository,
      ).persistedCount,
    ).toBe(0);
  });

  it("reports an expectation manifest surplus explicitly", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const expectation = provider.getIncidentExpectation("customer-a");
    const extraRecord: MeetingRecord = {
      provider: PROVIDER,
      customerId: "customer-a",
      transactionId: "txn-a-extra",
      title: "Extra incident record",
    };
    const alteredExpectation = {
      ...expectation,
      expectedRecords: [...expectation.expectedRecords, extraRecord],
    };

    for (const record of alteredExpectation.expectedRecords) {
      repository.save(record);
    }

    expect(
      new ReconciliationService().reconcileCustomer(
        alteredExpectation,
        repository,
      ),
    ).toMatchObject({
      providerReportedCount: 3,
      persistedCount: 4,
      correctCount: 4,
      missingCount: 0,
      unexpectedCount: 1,
      fulfilment: "SURPLUS",
    });
  });

  it("reconciles an unnamed customer without customer-specific branching", () => {
    const repository = new InMemoryRecordRepository();
    const record: MeetingRecord = {
      provider: PROVIDER,
      customerId: "customer-c",
      transactionId: "txn-c-001",
      title: "Customer C record",
    };
    const expectation = {
      provider: PROVIDER,
      customerId: "customer-c",
      reportedRecordCount: 1,
      expectedRecords: [record],
    };

    repository.save(record);

    expect(
      new ReconciliationService().reconcileCustomer(expectation, repository),
    ).toMatchObject({
      customerId: "customer-c",
      persistedCount: 1,
      correctCount: 1,
      fulfilment: "PASS",
    });
  });
});
