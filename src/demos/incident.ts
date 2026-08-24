import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { IngestionService } from "../pipeline/ingestion-service";
import { StubProvider } from "../provider/stub-provider";

const provider = new StubProvider();
const repository = new InMemoryRecordRepository();
const ingestion = new IngestionService(repository);
const batch = provider.getCustomerAIncidentBatch();
let exceptionsThrown = 0;

try {
  ingestion.ingestLegacy(batch);
} catch {
  exceptionsThrown += 1;
}

if (exceptionsThrown !== 0) {
  throw new Error(
    "The silent-failure demonstration did not execute successfully",
  );
}

const persisted = repository.countByCustomer("customer-a");

console.log("Demo execution: PASS");
console.log("Provider request: successful");
console.log("Service execution: successful");
console.log(`Exceptions thrown: ${exceptionsThrown}`);
console.log(`Provider-reported records: ${batch.reportedRecordCount}`);
console.log(`Payloads returned: ${batch.records.length}`);
console.log(`Records persisted: ${persisted}`);
console.log("Technical health: GREEN");
console.log("Customer outcome: FAIL");
console.log(`Missing records: ${batch.reportedRecordCount - persisted}`);
