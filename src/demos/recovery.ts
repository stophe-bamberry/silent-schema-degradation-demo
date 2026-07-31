import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { IngestionService } from "../pipeline/ingestion-service";
import { ReconciliationService } from "../pipeline/reconciliation-service";
import { RecoveryService } from "../pipeline/recovery-service";
import { StubProvider } from "../provider/stub-provider";

const provider = new StubProvider();
const historicalRepository = new InMemoryRecordRepository();
const recovery = new RecoveryService(provider, historicalRepository);
const firstRecovery = recovery.recover();
const secondRecovery = recovery.recover();
const reconciliation = new ReconciliationService();
const customerAResult = reconciliation.reconcileCustomer(
  provider.getIncidentBatch("customer-a"),
  historicalRepository,
);
const customerBResult = reconciliation.reconcileCustomer(
  provider.getIncidentBatch("customer-b"),
  historicalRepository,
);
const forwardRepository = new InMemoryRecordRepository();
const forwardIngestion = new IngestionService(forwardRepository);
const forwardRecords = [
  ...provider.getIncidentBatch("customer-a").records,
  ...provider.getIncidentBatch("customer-b").records,
];
const forwardInputs = forwardIngestion.identifyInputs(forwardRecords);
const forwardOutcomes = forwardIngestion.ingestCompatible(forwardRecords);
const accountability = reconciliation.reconcileAccountability(
  forwardInputs,
  forwardOutcomes,
);

console.log("First recovery");
console.log(`Retrieved: ${firstRecovery.historicalRecordsRetrieved}`);
console.log(`Created: ${firstRecovery.recordsCreated}`);
console.log(`Already existing: ${firstRecovery.alreadyExisting}`);
console.log(`Conflicts: ${firstRecovery.conflicts}`);
console.log("");
console.log("Second recovery");
console.log(`Retrieved: ${secondRecovery.historicalRecordsRetrieved}`);
console.log(`Created: ${secondRecovery.recordsCreated}`);
console.log(`Already existing: ${secondRecovery.alreadyExisting}`);
console.log(`Conflicts: ${secondRecovery.conflicts}`);
console.log("");
console.log(`Final unique records: ${historicalRepository.count()}`);
console.log(`Customer A fulfilment: ${customerAResult.fulfilment}`);
console.log(`Customer B fulfilment: ${customerBResult.fulfilment}`);
console.log(`Pipeline accountability: ${accountability.accountability}`);
console.log(`Duplicate records created: ${secondRecovery.recordsCreated}`);
