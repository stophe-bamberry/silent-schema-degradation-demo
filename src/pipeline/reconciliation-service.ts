import type { FulfilmentReconciliation } from "../domain/reconciliation-result";
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
}
