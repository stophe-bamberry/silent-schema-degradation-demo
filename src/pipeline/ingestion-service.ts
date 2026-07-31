import type {
  ProcessingInput,
  ProcessingOutcome,
} from "../domain/processing-outcome";
import type { ProviderBatch } from "../provider/provider-payload";
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

      this.repository.save(result.record);

      return {
        status: "persisted",
        provider: result.record.provider,
        customerId: result.record.customerId,
        transactionId: result.record.transactionId,
      };
    });
  }
}
