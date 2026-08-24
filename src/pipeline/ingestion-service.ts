import type { ProviderBatch } from "../provider/provider-payload";
import { transformLegacy } from "../provider/legacy-transformer";
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
}
