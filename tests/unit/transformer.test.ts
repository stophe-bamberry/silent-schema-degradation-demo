import { describe, expect, it } from "vitest";
import { InMemoryRecordRepository } from "../../src/persistence/in-memory-record-repository";
import { IngestionService } from "../../src/pipeline/ingestion-service";
import { transformCompatible } from "../../src/provider/compatible-transformer";
import { transformLegacy } from "../../src/provider/legacy-transformer";
import { StubProvider } from "../../src/provider/stub-provider";
import {
  customerABaselineV1,
  customerAIncidentV2,
  malformedV2Payload,
} from "../fixtures/customer-a";
import {
  customerBBaselineV1,
  customerBIncidentV2,
} from "../fixtures/customer-b";

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

describe("schema-compatible provider transformer", () => {
  it("validates and transforms multiple version 1 payloads", () => {
    const results = customerABaselineV1.map((payload) =>
      transformCompatible(payload),
    );

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "transformed")).toBe(
      true,
    );
  });

  it("validates and transforms all five version 2 incident payloads", () => {
    const incidentPayloads = [...customerAIncidentV2, ...customerBIncidentV2];
    const results = incidentPayloads.map((payload) =>
      transformCompatible(payload),
    );

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.status === "transformed")).toBe(
      true,
    );
  });

  it("maps version 1 and version 2 into the same canonical shape", () => {
    const versionOne = transformCompatible(customerABaselineV1[0]);
    const versionTwo = transformCompatible(customerAIncidentV2[0]);

    expect(versionOne.status).toBe("transformed");
    expect(versionTwo.status).toBe("transformed");

    if (
      versionOne.status !== "transformed" ||
      versionTwo.status !== "transformed"
    ) {
      throw new Error("Both supported schemas should transform");
    }

    expect(Object.keys(versionOne.record).sort()).toEqual([
      "customerId",
      "provider",
      "title",
      "transactionId",
    ]);
    expect(Object.keys(versionTwo.record).sort()).toEqual(
      Object.keys(versionOne.record).sort(),
    );
  });

  it("rejects a malformed payload while preserving its valid identity", () => {
    const result = transformCompatible(malformedV2Payload);

    expect(result.status).toBe("rejected");

    if (result.status !== "rejected") {
      throw new Error("The malformed payload should have been rejected");
    }

    expect(result.outcome.customerId).toBe("customer-a");
    expect(result.outcome.transactionId).toBe("txn-a-malformed-007");
    expect(result.outcome.reason).toMatch(/title/);
  });

  it("does not leak provider-specific fields beyond the adapter boundary", () => {
    const payloads = [customerABaselineV1[0], customerAIncidentV2[0]];

    for (const payload of payloads) {
      const result = transformCompatible(payload);

      expect(result.status).toBe("transformed");

      if (result.status !== "transformed") {
        throw new Error("Both supported schemas should transform");
      }

      expect(result.record).not.toHaveProperty("meetingTitle");
      expect(Object.keys(result.record).sort()).toEqual([
        "customerId",
        "provider",
        "title",
        "transactionId",
      ]);
    }
  });
});
