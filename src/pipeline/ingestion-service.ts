import {
  sameMeetingRecord,
  type MeetingRecord,
} from "../domain/meeting-record";
import type {
  ConflictOutcome,
  AlreadyExistingOutcome,
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
import { processingIdentityKey } from "../domain/processing-outcome";
import type { ProviderBatch } from "../provider/provider-payload";
import { transformCompatible } from "../provider/compatible-transformer";
import { transformLegacy } from "../provider/legacy-transformer";
import {
  identifyProcessingInput,
  transformValidated,
} from "../provider/validated-transformer";
import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";

export class IngestionService {
  constructor(private readonly repository: InMemoryRecordRepository) {}

  ingestLegacy(batch: ProviderBatch): void {
    for (const payload of batch.records) {
      const record = transformLegacy(payload);

      if (record !== undefined) {
        this.repository.save(record);
      }
    }
  }

  identifyInputs(records: readonly unknown[]): ProcessingInput[] {
    return records.map((payload) => identifyProcessingInput(payload));
  }

  ingestValidated(records: readonly unknown[]): ProcessingOutcome[] {
    return records.map((payload) => {
      const result = transformValidated(payload);

      if (result.status === "rejected") {
        return result.outcome;
      }

      return this.persist(result.record);
    });
  }

  ingestCompatible(records: readonly unknown[]): ProcessingOutcome[] {
    return records.map((payload) => this.ingestCompatiblePayload(payload));
  }

  ingestCompatibleBatch(
    batch: ProviderBatch<unknown>,
    expectedRecords?: readonly MeetingRecord[],
  ): ProcessingOutcome[] {
    const expectedRecordsByIdentity =
      expectedRecords === undefined
        ? undefined
        : new Map(
            expectedRecords.map((record) => [
              processingIdentityKey(record),
              record,
            ]),
          );

    return batch.records.map((payload) => {
      const identity = identifyProcessingInput(payload);

      if (
        identity.customerId !== "unknown" &&
        identity.customerId !== batch.customerId
      ) {
        return {
          ...identity,
          status: "rejected",
          reason: `Payload customer ${identity.customerId} does not match batch customer ${batch.customerId}`,
        };
      }

      if (
        expectedRecordsByIdentity !== undefined &&
        !expectedRecordsByIdentity.has(processingIdentityKey(identity))
      ) {
        return {
          ...identity,
          status: "rejected",
          reason: "Payload identity is outside the expected recovery inventory",
        };
      }

      const outcome = this.transformCompatiblePayload(payload);

      if ("record" in outcome) {
        const expectedRecord = expectedRecordsByIdentity?.get(
          processingIdentityKey(outcome.record),
        );

        if (
          expectedRecord !== undefined &&
          !sameMeetingRecord(outcome.record, expectedRecord)
        ) {
          return {
            provider: outcome.record.provider,
            customerId: outcome.record.customerId,
            transactionId: outcome.record.transactionId,
            status: "rejected",
            reason:
              "Canonical content does not match the expected recovery inventory",
          };
        }

        return this.persist(outcome.record);
      }

      return outcome.outcome;
    });
  }

  private ingestCompatiblePayload(payload: unknown): ProcessingOutcome {
    const result = this.transformCompatiblePayload(payload);

    if ("outcome" in result) {
      return result.outcome;
    }

    return this.persist(result.record);
  }

  private transformCompatiblePayload(payload: unknown) {
    return transformCompatible(payload);
  }

  private persist(record: MeetingRecord): ProcessingOutcome {
    const persistence = this.repository.save(record);
    const identity = {
      provider: record.provider,
      customerId: record.customerId,
      transactionId: record.transactionId,
    };

    if (persistence.status === "created") {
      return { ...identity, status: "persisted" };
    }

    if (persistence.status === "already-exists") {
      return {
        ...identity,
        status: "already-exists",
      } satisfies AlreadyExistingOutcome;
    }

    return {
      ...identity,
      status: "conflict",
      reason: persistence.reason,
    } satisfies ConflictOutcome;
  }
}
