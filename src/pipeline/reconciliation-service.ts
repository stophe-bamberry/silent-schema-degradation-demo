import type {
  FulfilmentReconciliation,
  PipelineAccountability,
} from "../domain/reconciliation-result";
import type {
  ProcessingIdentity,
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
import type { ProviderBatch } from "../provider/provider-payload";
import { StubProvider } from "../provider/stub-provider";
import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";

export class ReconciliationService {
  reconcileCustomer(
    batch: ProviderBatch,
    repository: InMemoryRecordRepository,
  ): FulfilmentReconciliation {
    const persistedCount = repository.countByScope(
      batch.provider,
      batch.customerId,
      batch.records.map((record) => record.transactionId),
    );
    const countDifference = batch.reportedRecordCount - persistedCount;
    const missingCount = Math.max(countDifference, 0);
    const unexpectedCount = Math.max(-countDifference, 0);

    return {
      customerId: batch.customerId,
      providerReportedCount: batch.reportedRecordCount,
      persistedCount,
      missingCount,
      unexpectedCount,
      fulfilment:
        countDifference === 0
          ? "PASS"
          : countDifference > 0
            ? "MISSING"
            : "SURPLUS",
    };
  }

  reconcileActiveCustomers(
    provider: StubProvider,
    repository: InMemoryRecordRepository,
  ): FulfilmentReconciliation[] {
    return provider
      .getActiveIncidentBatches()
      .map((batch) => this.reconcileCustomer(batch, repository));
  }

  reconcileAccountability(
    receivedInputs: readonly ProcessingInput[],
    outcomes: readonly ProcessingOutcome[],
  ): PipelineAccountability {
    const persistedCount = outcomes.filter(
      (outcome) => outcome.status === "persisted",
    ).length;
    const rejectedCount = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    ).length;
    const alreadyExistingCount = outcomes.filter(
      (outcome) => outcome.status === "already-exists",
    ).length;
    const conflictCount = outcomes.filter(
      (outcome) => outcome.status === "conflict",
    ).length;
    const expectedIdentityCounts = countIdentities(receivedInputs);
    const outcomeIdentityCounts = countIdentities(outcomes);
    const unaccountedCount = countExcessIdentities(
      expectedIdentityCounts,
      outcomeIdentityCounts,
    );
    const excessOutcomeCount = countExcessIdentities(
      outcomeIdentityCounts,
      expectedIdentityCounts,
    );

    return {
      receivedCount: receivedInputs.length,
      persistedCount,
      rejectedCount,
      alreadyExistingCount,
      conflictCount,
      outcomeCount: outcomes.length,
      unaccountedCount,
      excessOutcomeCount,
      accountability:
        excessOutcomeCount > 0
          ? "EXCESS_OUTCOMES"
          : unaccountedCount > 0
            ? "UNACCOUNTED"
            : "PASS",
    };
  }
}

function countIdentities(
  identities: readonly ProcessingIdentity[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const identity of identities) {
    const key = identityKey(identity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function countExcessIdentities(
  expected: ReadonlyMap<string, number>,
  actual: ReadonlyMap<string, number>,
): number {
  let excessCount = 0;

  for (const [key, expectedCount] of expected) {
    excessCount += Math.max(expectedCount - (actual.get(key) ?? 0), 0);
  }

  return excessCount;
}

function identityKey(identity: ProcessingIdentity): string {
  return `${identity.provider}:${identity.customerId}:${identity.transactionId}`;
}
