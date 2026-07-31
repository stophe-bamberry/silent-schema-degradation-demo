import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { IngestionService } from "../pipeline/ingestion-service";
import { ReconciliationService } from "../pipeline/reconciliation-service";
import { StubProvider } from "../provider/stub-provider";

const provider = new StubProvider();
const repository = new InMemoryRecordRepository();
const ingestion = new IngestionService(repository);
const reconciliation = new ReconciliationService();

ingestion.ingestLegacy(provider.getIncidentBatch("customer-a"));
ingestion.ingestLegacy(provider.getIncidentBatch("customer-b"));

console.log("Reported incident");

const customerA = reconciliation.reconcileCustomer(
  provider.getIncidentBatch("customer-a"),
  repository,
);

console.log(
  `${customerA.customerId}: ${customerA.fulfilment}, ${customerA.missingCount} records missing`,
);

console.log("\nActive-customer sweep");

for (const result of reconciliation.reconcileActiveCustomers(
  provider,
  repository,
)) {
  console.log(
    `${result.customerId}: ${result.fulfilment}, ${result.missingCount} records missing`,
  );
}
