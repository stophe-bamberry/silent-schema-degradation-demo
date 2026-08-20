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
const outcomes = ingestion.ingestValidated(receivedRecords);
const accountability = reconciliation.reconcileAccountability(
  receivedInputs,
  outcomes,
);
const customerAFulfilment = reconciliation.reconcileCustomer(
  provider.getIncidentExpectation("customer-a"),
  repository,
);
const customerBFulfilment = reconciliation.reconcileCustomer(
  provider.getIncidentExpectation("customer-b"),
  repository,
);
const providerReported =
  customerABatch.reportedRecordCount + customerBBatch.reportedRecordCount;
const fulfilment =
  customerAFulfilment.fulfilment === "PASS" &&
  customerBFulfilment.fulfilment === "PASS"
    ? "PASS"
    : "FAIL";

console.log(`Provider reported: ${providerReported}`);
console.log(`Received inputs: ${accountability.receivedCount}`);
console.log(`Outcomes: ${accountability.outcomeCount}`);
console.log(`Persisted: ${accountability.persistedCount}`);
console.log(`Explicitly rejected: ${accountability.rejectedCount}`);
console.log(`Unaccounted: ${accountability.unaccountedCount}`);
console.log(`Excess outcomes: ${accountability.excessOutcomeCount}`);
console.log(`Pipeline accountability: ${accountability.accountability}`);
console.log(`Customer fulfilment: ${fulfilment}`);
console.log("Stage 02 status: explicit accountability, not a complete repair");
