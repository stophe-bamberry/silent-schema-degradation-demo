import type {
  FulfilmentReconciliation,
  PipelineAccountability,
} from "../domain/reconciliation-result";
import type {
  ProcessingIdentity,
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
import { processingIdentityKey } from "../domain/processing-outcome";
import type { MeetingRecord } from "../domain/meeting-record";
import type { ProviderExpectation } from "../provider/provider-payload";
import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";

type ActiveExpectationSource = {
  getActiveIncidentExpectations(): readonly ProviderExpectation[];
};

export class ReconciliationService {
  reconcileCustomer(
    expectation: ProviderExpectation,
    repository: InMemoryRecordRepository,
  ): FulfilmentReconciliation {
    let correctCount = 0;
    let persistedCount = 0;
    let conflictCount = 0;
    let invalidExpectationCount = 0;
    let duplicateExpectedIdentityCount = 0;
    const uniqueExpectedRecords: MeetingRecord[] = [];
    const expectedIdentityKeys = new Set<string>();

    for (const expectedRecord of expectation.expectedRecords) {
      if (
        expectedRecord.provider !== expectation.provider ||
        expectedRecord.customerId !== expectation.customerId
      ) {
        invalidExpectationCount += 1;
        continue;
      }

      const key = processingIdentityKey(expectedRecord);

      if (expectedIdentityKeys.has(key)) {
        duplicateExpectedIdentityCount += 1;
        continue;
      }

      expectedIdentityKeys.add(key);
      uniqueExpectedRecords.push(expectedRecord);
    }

    for (const expectedRecord of uniqueExpectedRecords) {
      const persistedRecord = repository.find(expectedRecord);

      if (persistedRecord === undefined) {
        continue;
      }

      persistedCount += 1;

      if (repository.containsExact(expectedRecord)) {
        correctCount += 1;
      } else {
        conflictCount += 1;
      }
    }

    const missingExpectedRecords =
      uniqueExpectedRecords.length - persistedCount;
    const missingFromManifest = Math.max(
      expectation.reportedRecordCount - uniqueExpectedRecords.length,
      0,
    );
    const unexpectedCount = Math.max(
      uniqueExpectedRecords.length - expectation.reportedRecordCount,
      0,
    );
    const missingCount = missingExpectedRecords + missingFromManifest;

    return {
      customerId: expectation.customerId,
      providerReportedCount: expectation.reportedRecordCount,
      persistedCount,
      correctCount,
      missingCount,
      unexpectedCount,
      conflictCount,
      invalidExpectationCount,
      duplicateExpectedIdentityCount,
      fulfilment:
        invalidExpectationCount > 0 || duplicateExpectedIdentityCount > 0
          ? "INVALID_EXPECTATION"
          : conflictCount > 0
            ? "CONFLICT"
            : missingCount > 0
              ? "MISSING"
              : unexpectedCount > 0
                ? "SURPLUS"
                : "PASS",
    };
  }

  reconcileActiveCustomers(
    provider: ActiveExpectationSource,
    repository: InMemoryRecordRepository,
  ): FulfilmentReconciliation[] {
    return provider
      .getActiveIncidentExpectations()
      .map((expectation) => this.reconcileCustomer(expectation, repository));
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
    const key = processingIdentityKey(identity);
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
