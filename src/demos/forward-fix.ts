import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { IngestionService } from "../pipeline/ingestion-service";
import { ReconciliationService } from "../pipeline/reconciliation-service";
import { StubProvider } from "../provider/stub-provider";

const provider = new StubProvider();
const repository = new InMemoryRecordRepository();
const ingestion = new IngestionService(repository);
const reconciliation = new ReconciliationService();
const customerABatch = provider.getIncidentBatch("customer-a");
const customerBBatch = provider.getIncidentBatch("customer-b");
const receivedRecords = [...customerABatch.records, ...customerBBatch.records];
const receivedInputs = ingestion.identifyInputs(receivedRecords);
const outcomes = ingestion.ingestCompatible(receivedRecords);
const customerAResult = reconciliation.reconcileCustomer(
  customerABatch,
  repository,
);
const customerBResult = reconciliation.reconcileCustomer(
  customerBBatch,
  repository,
);
const accountability = reconciliation.reconcileAccountability(
  receivedInputs,
  outcomes,
);

console.log("Forward processing: FIXED");
console.log(
  `customer-a: ${customerAResult.providerReportedCount} reported, ${customerAResult.persistedCount} persisted`,
);
console.log(
  `customer-b: ${customerBResult.providerReportedCount} reported, ${customerBResult.persistedCount} persisted`,
);
console.log(`Rejected: ${accountability.rejectedCount}`);
console.log(`Unaccounted: ${accountability.unaccountedCount}`);
console.log(`Pipeline accountability: ${accountability.accountability}`);
console.log(
  `Customer fulfilment: ${
    customerAResult.fulfilment === "PASS" &&
    customerBResult.fulfilment === "PASS"
      ? "PASS"
      : "FAIL"
  }`,
);
console.log("Historical recovery: OUTSTANDING");
