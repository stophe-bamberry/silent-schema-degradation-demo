import type { MeetingRecord } from "../domain/meeting-record";
import type {
  PersistedOutcome,
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
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
    return records.map((payload) => {
      const result = transformCompatible(payload);

      if (result.status === "rejected") {
        return result.outcome;
      }

      return this.persist(result.record);
    });
  }

  private persist(record: MeetingRecord): PersistedOutcome {
    this.repository.save(record);

    return {
      status: "persisted",
      provider: record.provider,
      customerId: record.customerId,
      transactionId: record.transactionId,
    };
  }
}
