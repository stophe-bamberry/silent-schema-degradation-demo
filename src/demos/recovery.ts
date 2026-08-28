import { InMemoryRecordRepository } from "../persistence/in-memory-record-repository";
import { RecoveryService } from "../pipeline/recovery-service";
import { StubProvider } from "../provider/stub-provider";

const provider = new StubProvider();
const historicalRepository = new InMemoryRecordRepository();
const recovery = new RecoveryService(provider, historicalRepository);
const firstRecovery = recovery.recover();
const secondRecovery = recovery.recover();

console.log("First recovery");
console.log(`Expected: ${firstRecovery.historicalRecordsExpected}`);
console.log(`Retrieved: ${firstRecovery.historicalRecordsRetrieved}`);
console.log(`Created: ${firstRecovery.recordsCreated}`);
console.log(`Already correct: ${firstRecovery.alreadyCorrect}`);
console.log(`Rejected: ${firstRecovery.rejected}`);
console.log(`Conflicts: ${firstRecovery.conflicts}`);
console.log(
  `Pipeline accountability: ${firstRecovery.accountability.accountability}`,
);
console.log(`Recovery complete: ${firstRecovery.recoveryComplete}`);
console.log(`final recovery complete ${firstRecovery.recoveryComplete}`);
console.log("");
console.log("Second recovery");
console.log(`Expected: ${secondRecovery.historicalRecordsExpected}`);
console.log(`Retrieved: ${secondRecovery.historicalRecordsRetrieved}`);
console.log(`Created: ${secondRecovery.recordsCreated}`);
console.log(`Already correct: ${secondRecovery.alreadyCorrect}`);
console.log(`Rejected: ${secondRecovery.rejected}`);
console.log(`Conflicts: ${secondRecovery.conflicts}`);
console.log(
  `Pipeline accountability: ${secondRecovery.accountability.accountability}`,
);
console.log(`Recovery complete: ${secondRecovery.recoveryComplete}`);
console.log(`final recovery complete ${secondRecovery.recoveryComplete}`);
console.log("");
console.log(
  `Correct incident records: ${secondRecovery.correctIncidentRecords}`,
);
for (const result of secondRecovery.customerFulfilment) {
  console.log(`${result.customerId} fulfilment: ${result.fulfilment}`);
}
console.log(`Duplicate records created: ${secondRecovery.recordsCreated}`);
