import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { transformLegacy } from "../../src/provider/legacy-transformer";
import { StubProvider } from "../../src/provider/stub-provider";
import {
  customerABaselineV1,
  customerAIncidentV2,
} from "../fixtures/customer-a";
import { customerBBaselineV1 } from "../fixtures/customer-b";

describe("legacy provider transformer", () => {
  it("transforms multiple version 1 payloads into canonical records", () => {
    const records = customerABaselineV1.map((payload) =>
      transformLegacy(payload),
    );

    expect(records).toEqual([
      {
        provider: "example-provider",
        customerId: "customer-a",
        transactionId: "txn-a-001",
        title: "Quarterly review",
      },
      {
        provider: "example-provider",
        customerId: "customer-a",
        transactionId: "txn-a-002",
        title: "Leadership sync",
      },
    ]);
  });

  it("persists multiple valid version 1 records for both customers", () => {
    const provider = new StubProvider();
    const repository = new InMemoryRecordRepository();
    const ingestion = new IngestionService(repository);

    ingestion.ingestLegacy(provider.getBaselineBatch("customer-a"));
    ingestion.ingestLegacy(provider.getBaselineBatch("customer-b"));

    expect(repository.countByCustomer("customer-a")).toBe(
      customerABaselineV1.length,
    );
    expect(repository.countByCustomer("customer-b")).toBe(
      customerBBaselineV1.length,
    );
  });

  it.each(customerAIncidentV2)(
    "silently drops incident payload $transactionId without throwing",
    (payload) => {
      const repository = new InMemoryRecordRepository();
      const ingestion = new IngestionService(repository);
      const provider = new StubProvider();
      const batch = {
        ...provider.getCustomerAIncidentBatch(),
        records: [payload],
        reportedRecordCount: 1,
      };

      expect(() => ingestion.ingestLegacy(batch)).not.toThrow();
      expect(transformLegacy(payload)).toBeUndefined();
      expect(repository.countByCustomer("customer-a")).toBe(0);
    },
  );
});
