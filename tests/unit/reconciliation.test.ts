import { describe, expect, it } from "vitest";
import { PROVIDER } from "../../src/domain/meeting-record";
import type { MeetingRecord } from "../../src/domain/meeting-record";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { transformLegacy } from "../../src/provider/legacy-transformer";
import { StubProvider } from "../../src/provider/stub-provider";
import { customerABaselineV1 } from "../fixtures/customer-a";

describe("customer fulfilment reconciliation", () => {
  it("detects Customer A missing exactly three provider-reported records", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();

    ingestion.ingestLegacy(provider.getIncidentBatch("customer-a"));

    expect(
      reconciliation.reconcileCustomer(
        provider.getIncidentBatch("customer-a"),
        repository,
      ),
    ).toEqual({
      customerId: "customer-a",
      providerReportedCount: 3,
      persistedCount: 0,
      missingCount: 3,
      unexpectedCount: 0,
      fulfilment: "MISSING",
    });
  });

  it("discovers Customer B through the generic active-customer sweep", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();

    for (const customerId of ["customer-a", "customer-b"] as const) {
      ingestion.ingestLegacy(provider.getIncidentBatch(customerId));
    }

    const results = reconciliation.reconcileActiveCustomers(
      provider,
      repository,
    );

    expect(results).toEqual([
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
  });

  it("uses explicit provider metadata even when the returned records are unchanged", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const reconciliation = new ReconciliationService();
    const originalBatch = provider.getIncidentBatch("customer-a");
    const alteredBatch = {
      ...originalBatch,
      reportedRecordCount: 4,
    };

    const result = reconciliation.reconcileCustomer(alteredBatch, repository);

    expect(alteredBatch.records).toBe(originalBatch.records);
    expect(result.providerReportedCount).toBe(4);
    expect(result.missingCount).toBe(4);
    expect(result.unexpectedCount).toBe(0);
  });

  it("uses the repository for persisted count without changing provider metadata", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const reconciliation = new ReconciliationService();
    const batch = provider.getIncidentBatch("customer-a");

    const beforePersistence = reconciliation.reconcileCustomer(
      batch,
      repository,
    );
    repository.save({
      provider: PROVIDER,
      customerId: "customer-a",
      transactionId: batch.records[0].transactionId,
      title: "Persisted incident record",
    });

    const afterPersistence = reconciliation.reconcileCustomer(
      batch,
      repository,
    );

    expect(beforePersistence.providerReportedCount).toBe(3);
    expect(afterPersistence.providerReportedCount).toBe(3);
    expect(beforePersistence.persistedCount).toBe(0);
    expect(afterPersistence.persistedCount).toBe(1);
    expect(afterPersistence.missingCount).toBe(2);
    expect(afterPersistence.unexpectedCount).toBe(0);
  });

  it("does not use transformation outcomes as the provider expected count", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);
    const reconciliation = new ReconciliationService();
    const batch = provider.getIncidentBatch("customer-a");

    ingestion.ingestLegacy(batch);

    const result = reconciliation.reconcileCustomer(batch, repository);

    expect(result.providerReportedCount).toBe(3);
    expect(result.persistedCount).toBe(0);
    expect(result.missingCount).toBe(3);
    expect(result.unexpectedCount).toBe(0);
  });

  it("does not count pre-existing baseline records for the incident window", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const baselineRecord = transformLegacy(customerABaselineV1[0]);

    if (baselineRecord === undefined) {
      throw new Error("The v1 fixture should transform into a record");
    }

    repository.save(baselineRecord);

    expect(
      new ReconciliationService().reconcileCustomer(
        provider.getIncidentBatch("customer-a"),
        repository,
      ),
    ).toMatchObject({
      persistedCount: 0,
      missingCount: 3,
      unexpectedCount: 0,
      fulfilment: "MISSING",
    });
  });

  it("ignores a record outside the incident transaction scope", () => {
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
        provider.getIncidentBatch("customer-a"),
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
      title: "Customer B record",
    });

    expect(
      new ReconciliationService().reconcileCustomer(
        provider.getIncidentBatch("customer-a"),
        repository,
      ).persistedCount,
    ).toBe(0);
  });

  it("reports surplus scoped persistence explicitly", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const batch = provider.getIncidentBatch("customer-a");
    const extraPayload = {
      transactionId: "txn-a-extra",
      customerId: "customer-a",
      title: "Extra incident record",
    };
    const alteredBatch = {
      ...batch,
      records: [...batch.records, extraPayload],
    };

    for (const transactionId of alteredBatch.records.map(
      (record) => record.transactionId,
    )) {
      repository.save({
        provider: PROVIDER,
        customerId: "customer-a",
        transactionId,
        title: "Persisted incident record",
      });
    }

    expect(
      new ReconciliationService().reconcileCustomer(alteredBatch, repository),
    ).toMatchObject({
      providerReportedCount: 3,
      persistedCount: 4,
      missingCount: 0,
      unexpectedCount: 1,
      fulfilment: "SURPLUS",
    });
  });

  it("reconciles an unnamed customer without customer-specific branching", () => {
    const repository = new InMemoryRecordRepository();
    const batch = {
      provider: PROVIDER,
      customerId: "customer-c",
      reportedRecordCount: 1,
      records: [
        {
          transactionId: "txn-c-001",
          customerId: "customer-c",
          title: "Customer C record",
        },
      ],
    };

    repository.save({
      provider: PROVIDER,
      customerId: "customer-c",
      transactionId: "txn-c-001",
      title: "Customer C record",
    } satisfies MeetingRecord);

    expect(
      new ReconciliationService().reconcileCustomer(batch, repository),
    ).toMatchObject({
      customerId: "customer-c",
      persistedCount: 1,
      fulfilment: "PASS",
    });
  });
});
