import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import type {
  ProcessingIdentity,
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
import { processingIdentityKey } from "../domain/processing-outcome";
import type {
  ProviderBatch,
  ProviderExpectation,
} from "../provider/provider-payload";
import { IngestionService } from "./ingestion-service";
import type {
  FulfilmentReconciliation,
  PipelineAccountability,
} from "../domain/reconciliation-result";
import { ReconciliationService } from "./reconciliation-service";

export interface HistoricalRecoveryProvider {
  getHistoricalIncidentBatches(): readonly ProviderBatch<unknown>[];
  getHistoricalIncidentExpectations(): readonly ProviderExpectation[];
}

export type RecoveryReport = {
  historicalRecordsExpected: number;
  historicalRecordsRetrieved: number;
  recordsCreated: number;
  alreadyCorrect: number;
  rejected: number;
  conflicts: number;
  correctIncidentRecords: number;
  invalidExpectationCount: number;
  duplicateExpectedIdentityCount: number;
  invalidBatchCount: number;
  expectedButNotRetrievedCount: number;
  unexpectedRetrievedCount: number;
  receivedInputs: ProcessingInput[];
  outcomes: ProcessingOutcome[];
  accountability: PipelineAccountability;
  customerFulfilment: FulfilmentReconciliation[];
  recoveryComplete: boolean;
};

export class RecoveryService {
  constructor(
    private readonly provider: HistoricalRecoveryProvider,
    private readonly repository: InMemoryRecordRepository,
  ) {}

  recover(): RecoveryReport {
    const historicalBatches = this.provider.getHistoricalIncidentBatches();
    const expectations = this.provider.getHistoricalIncidentExpectations();
    const ingestion = new IngestionService(this.repository);
    const reconciliation = new ReconciliationService();
    const expectedIdentities = expectations.flatMap(
      (expectation) => expectation.expectedRecords,
    );
    const receivedInputs = historicalBatches.flatMap((batch) =>
      ingestion.identifyInputs(batch.records),
    );
    const outcomes = historicalBatches.flatMap((batch) =>
      ingestion.ingestCompatibleBatch(
        batch,
        expectations
          .filter(
            (expectation) =>
              expectation.provider === batch.provider &&
              expectation.customerId === batch.customerId,
          )
          .flatMap((expectation) => expectation.expectedRecords),
      ),
    );
    const accountability = reconciliation.reconcileAccountability(
      receivedInputs,
      outcomes,
    );
    const customerFulfilment = expectations.map((expectation) =>
      reconciliation.reconcileCustomer(expectation, this.repository),
    );
    const historicalRecordsExpected = expectations.reduce(
      (total, expectation) => total + expectation.reportedRecordCount,
      0,
    );
    const historicalRecordsRetrieved = receivedInputs.length;
    const recordsCreated = countOutcomes(outcomes, "persisted");
    const alreadyCorrect = countOutcomes(outcomes, "already-exists");
    const rejected = countOutcomes(outcomes, "rejected");
    const conflicts = countOutcomes(outcomes, "conflict");
    const correctIncidentRecords = customerFulfilment.reduce(
      (total, result) => total + result.correctCount,
      0,
    );
    const invalidExpectationCount = customerFulfilment.reduce(
      (total, result) => total + result.invalidExpectationCount,
      0,
    );
    const duplicateExpectedIdentityCount =
      countDuplicateIdentities(expectedIdentities);
    const invalidBatchCount = historicalBatches.filter((batch) => {
      const matchingExpectations = expectations.filter(
        (expectation) =>
          expectation.provider === batch.provider &&
          expectation.customerId === batch.customerId,
      );

      return (
        matchingExpectations.length !== 1 ||
        matchingExpectations[0].reportedRecordCount !==
          batch.reportedRecordCount
      );
    }).length;
    const inventoryCoverage = compareIdentityInventory(
      expectedIdentities,
      receivedInputs,
    );
    const recoveryComplete =
      invalidExpectationCount === 0 &&
      duplicateExpectedIdentityCount === 0 &&
      invalidBatchCount === 0 &&
      inventoryCoverage.expectedButNotRetrievedCount === 0 &&
      inventoryCoverage.unexpectedRetrievedCount === 0 &&
      accountability.accountability === "PASS" &&
      rejected === 0 &&
      conflicts === 0 &&
      customerFulfilment.every((result) => result.fulfilment === "PASS");

    return {
      historicalRecordsExpected,
      historicalRecordsRetrieved,
      recordsCreated,
      alreadyCorrect,
      rejected,
      conflicts,
      correctIncidentRecords,
      invalidExpectationCount,
      duplicateExpectedIdentityCount,
      invalidBatchCount,
      ...inventoryCoverage,
      receivedInputs,
      outcomes,
      accountability,
      customerFulfilment,
      recoveryComplete,
    };
  }
}

function compareIdentityInventory(
  expected: readonly ProcessingIdentity[],
  retrieved: readonly ProcessingIdentity[],
): {
  expectedButNotRetrievedCount: number;
  unexpectedRetrievedCount: number;
} {
  const expectedKeys = identityKeys(expected);
  const retrievedKeys = identityKeys(retrieved);

  return {
    expectedButNotRetrievedCount: countMissingKeys(expectedKeys, retrievedKeys),
    unexpectedRetrievedCount: countMissingKeys(retrievedKeys, expectedKeys),
  };
}

function identityKeys(
  identities: readonly ProcessingIdentity[],
): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const identity of identities) {
    keys.add(processingIdentityKey(identity));
  }

  return keys;
}

function countDuplicateIdentities(
  identities: readonly ProcessingIdentity[],
): number {
  const seen = new Set<string>();
  let duplicates = 0;

  for (const identity of identities) {
    const key = processingIdentityKey(identity);

    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  }

  return duplicates;
}

function countMissingKeys(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
): number {
  let missing = 0;

  for (const key of expected) {
    if (!actual.has(key)) {
      missing += 1;
    }
  }

  return missing;
}

function countOutcomes(
  outcomes: readonly ProcessingOutcome[],
  status: ProcessingOutcome["status"],
): number {
  return outcomes.filter((outcome) => outcome.status === status).length;
}
