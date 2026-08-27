import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { transformCompatible } from "../provider/compatible-transformer";
import { StubProvider } from "../provider/stub-provider";

export type RecoverySummary = {
  historicalRecordsRetrieved: number;
  recordsCreated: number;
  alreadyExisting: number;
  conflicts: number;
  uniqueIncidentRecords: number;
};

export class RecoveryService {
  constructor(
    private readonly provider: StubProvider,
    private readonly repository: InMemoryRecordRepository,
  ) {}

  recover(): RecoverySummary {
    let historicalRecordsRetrieved = 0;
    let recordsCreated = 0;
    let alreadyExisting = 0;
    let conflicts = 0;
    const historicalBatches = this.provider.getHistoricalIncidentBatches();

    for (const batch of historicalBatches) {
      for (const payload of batch.records) {
        historicalRecordsRetrieved += 1;
        const transformation = transformCompatible(payload);

        if (transformation.status === "rejected") {
          throw new Error(
            `Historical payload ${transformation.outcome.transactionId} was rejected: ${transformation.outcome.reason}`,
          );
        }

        const persistence = this.repository.save(transformation.record);

        if (persistence.status === "created") {
          recordsCreated += 1;
        } else if (persistence.status === "already-exists") {
          alreadyExisting += 1;
        } else {
          conflicts += 1;
        }
      }
    }

    const uniqueIncidentRecords = historicalBatches.reduce(
      (total, batch) =>
        total +
        this.repository.countWithinScope({
          provider: batch.provider,
          customerId: batch.customerId,
          transactionIds: batch.records.map((record) => record.transactionId),
        }),
      0,
    );

    return {
      historicalRecordsRetrieved,
      recordsCreated,
      alreadyExisting,
      conflicts,
      uniqueIncidentRecords,
    };
  }
}
