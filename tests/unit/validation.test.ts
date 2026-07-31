import { describe, expect, it } from "vitest";
import { PROVIDER } from "../../src/domain/meeting-record";
import type {
  ProcessingInput,
  ProcessingOutcome,
} from "../../src/domain/processing-outcome";
import { ReconciliationService } from "../../src/pipeline/reconciliation-service";
import { transformValidated } from "../../src/provider/validated-transformer";
import {
  customerAIncidentV2,
  customerABaselineV1,
} from "../fixtures/customer-a";
import { customerBIncidentV2 } from "../fixtures/customer-b";

const incidentPayloads = [...customerAIncidentV2, ...customerBIncidentV2];

function input(customerId: string, transactionId: string): ProcessingInput {
  return { provider: PROVIDER, customerId, transactionId };
}

function outcome(customerId: string, transactionId: string): ProcessingOutcome {
  return {
    status: "rejected",
    provider: PROVIDER,
    customerId,
    transactionId,
    reason: "unsupported provider schema",
  };
}

describe("validated provider transformer", () => {
  it("accepts a valid version 1 payload and returns the canonical record", () => {
    expect(transformValidated(customerABaselineV1[0])).toEqual({
      status: "transformed",
      record: {
        provider: "example-provider",
        customerId: "customer-a",
        transactionId: "txn-a-001",
        title: "Quarterly review",
      },
    });
  });

  it("explicitly rejects all five version 2 incident inputs", () => {
    const results = incidentPayloads.map((payload) =>
      transformValidated(payload),
    );

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
  });
});

describe("pipeline accountability", () => {
  it("passes five received identities with five matching outcomes", () => {
    const receivedInputs = [
      input("customer-a", "txn-a-001"),
      input("customer-a", "txn-a-002"),
      input("customer-a", "txn-a-004"),
      input("customer-b", "txn-shared-005"),
      input("customer-b", "txn-b-006"),
    ];
    const outcomes = receivedInputs.map((received) =>
      outcome(received.customerId, received.transactionId),
    );

    expect(
      new ReconciliationService().reconcileAccountability(
        receivedInputs,
        outcomes,
      ),
    ).toEqual({
      receivedCount: 5,
      persistedCount: 0,
      rejectedCount: 5,
      outcomeCount: 5,
      unaccountedCount: 0,
      excessOutcomeCount: 0,
      accountability: "PASS",
    });
  });

  it("reports one unaccounted input when an outcome is removed", () => {
    const receivedInputs = [
      input("customer-a", "txn-a-004"),
      input("customer-a", "txn-shared-005"),
    ];
    const outcomes = [outcome("customer-a", "txn-a-004")];

    expect(
      new ReconciliationService().reconcileAccountability(
        receivedInputs,
        outcomes,
      ),
    ).toMatchObject({
      receivedCount: 2,
      outcomeCount: 1,
      unaccountedCount: 1,
      excessOutcomeCount: 0,
      accountability: "UNACCOUNTED",
    });
  });

  it("reports an excess outcome when an outcome is duplicated", () => {
    const receivedInputs = [input("customer-a", "txn-a-004")];
    const outcomes = [
      outcome("customer-a", "txn-a-004"),
      outcome("customer-a", "txn-a-004"),
    ];

    expect(
      new ReconciliationService().reconcileAccountability(
        receivedInputs,
        outcomes,
      ),
    ).toMatchObject({
      receivedCount: 1,
      outcomeCount: 2,
      unaccountedCount: 0,
      excessOutcomeCount: 1,
      accountability: "EXCESS_OUTCOMES",
    });
  });

  it("reports missing and unexpected identities when one is replaced", () => {
    const receivedInputs = [
      input("customer-a", "txn-a-004"),
      input("customer-a", "txn-a-006"),
    ];
    const outcomes = [
      outcome("customer-a", "txn-a-004"),
      outcome("customer-a", "txn-unexpected"),
    ];

    expect(
      new ReconciliationService().reconcileAccountability(
        receivedInputs,
        outcomes,
      ),
    ).toMatchObject({
      receivedCount: 2,
      outcomeCount: 2,
      unaccountedCount: 1,
      excessOutcomeCount: 1,
      accountability: "EXCESS_OUTCOMES",
    });
  });

  it("does not let another customer's outcome satisfy an input", () => {
    const receivedInputs = [input("customer-a", "txn-shared-005")];
    const outcomes = [outcome("customer-b", "txn-shared-005")];

    expect(
      new ReconciliationService().reconcileAccountability(
        receivedInputs,
        outcomes,
      ),
    ).toMatchObject({
      unaccountedCount: 1,
      excessOutcomeCount: 1,
      accountability: "EXCESS_OUTCOMES",
    });
  });

  it("keeps the received count independent from the outcome count", () => {
    const receivedInputs = [
      input("customer-a", "txn-a-004"),
      input("customer-a", "txn-a-006"),
      input("customer-b", "txn-b-006"),
    ];
    const outcomes = [outcome("customer-a", "txn-a-004")];
    const result = new ReconciliationService().reconcileAccountability(
      receivedInputs,
      outcomes,
    );

    expect(result.receivedCount).toBe(3);
    expect(result.outcomeCount).toBe(1);
    expect(result.unaccountedCount).toBe(2);
  });
});
