# Silent Schema Degradation Demo

A deliberately small TypeScript demonstration of a provider schema change that silently drops customer records, followed by staged controls that detect, prevent, and recover from the failure.

The provider changes `meetingTitle` to `title`. The legacy transformer reads only `meetingTitle`, returns `undefined` for the new payload, and the legacy ingestion path ignores `undefined`. The request succeeds, no exception is thrown, technical health remains green, and customer fulfilment is wrong.

## Scenario

The stub provider has one provider, two customers, and explicit provider metadata:

- Customer A has three incident records.
- Customer B has two incident records.
- Both incident sets use the v2 `title` field.
- `txn-shared-005` appears once for each customer. The customer is part of the business identity, so these are two records.

The v1 baseline uses `meetingTitle`. The malformed v2 fixture has valid customer and transaction identities but an empty title, so validation can reject it without losing identity.

## Stage Journey

Each stage is one sequential implementation commit, branch, and annotated tag.

| Stage | Branch | Commit | Tag | Result |
| --- | --- | --- | --- | --- |
| 00 | `stage/00-silent-failure` | `demo: reproduce silent schema drift failure` | `stage-00-silent-failure` | Reproduces the silent drop. |
| 01 | `stage/01-reconciliation-detection` | `test: add independent reconciliation detection` | `stage-01-reconciliation-detection` | Detects missing fulfilment independently. |
| 02 | `stage/02-explicit-schema-validation` | `fix: make schema failures explicit` | `stage-02-explicit-schema-validation` | Rejects unsupported payloads explicitly with Zod. |
| 03 | `stage/03-schema-compatible-transformer` | `fix: support provider schema v2` | `stage-03-schema-compatible-transformer` | Maps v1 and v2 into one canonical record for new processing. |
| 04 | `stage/04-idempotent-recovery` | `feat: add idempotent historical recovery` | `stage-04-idempotent-recovery` | Recovers the historical gap safely and repeatably. |

The final `main` branch is the Stage 04 commit.

## Controls

### Stage 01: Reported incident

Fulfilment reconciliation keeps the provider's `reportedRecordCount` independent from returned payloads, transformer results, persistence attempts, and stored totals. It queries the repository for the provider, customer, and transaction IDs in the incident window. The result is `PASS` when the scoped count matches, `MISSING` when records are absent, and `SURPLUS` when more scoped records exist than the provider reported.

### Stage 01: Active-customer sweep

The sweep obtains active customer batches from provider data and applies the same scoped reconciliation to each customer. It is not a Customer A or Customer B conditional, so it discovers both incident populations.

### Pipeline accountability

The ingestion path keeps received-input identities separate from processing outcomes. Every received input should have one matching terminal outcome: a new record is reported as `persisted`, an identical duplicate as `already-exists`, a malformed or unsupported payload as `rejected` with identity and reason, and a content mismatch at an existing identity as `conflict`. Conflicts never overwrite the original record and are never counted as persisted.

Accountability can therefore be `PASS` even when fulfilment fails: Stage 02 accounts for all five inputs as rejections, but persists none. `unaccountedCount` and `excessOutcomeCount` compare the independent identity sets; persistence counts describe outcome categories, not customer fulfilment.

### Provider compatibility boundary

The provider adapter owns strict schema checks and field-name differences:

- v1: `transactionId`, `customerId`, `meetingTitle`.
- v2: `transactionId`, `customerId`, `title`.
- Canonical output: `provider`, `customerId`, `transactionId`, and `title`.

The ingestion, repository, reconciliation, and recovery services do not inspect provider-specific field names.

### Idempotent recovery

Repository identity is `provider:customerId:transactionId`. Historical recovery retrieves the explicit five-record incident window, transforms through the compatible provider boundary, and uses the same persistence operation as normal processing. A repeated recovery returns `already-exists` outcomes without creating duplicates. Its unique-record summary is scoped to the provider, customer, and incident transaction IDs, so unrelated baseline records do not inflate the result.

## Run It

Requirements: Node.js 20 and npm.

Install the committed dependency set:

```bash
npm ci
```

Run the final checks:

```bash
npm run format
npm run format:check
npm run typecheck
npm test
```

Run the final recovery demonstration:

```bash
npm run demo:recovery
```

To inspect the stage boundaries, switch to a stage branch and run the demos available at that point:

```bash
git switch stage/00-silent-failure
npm test
npm run demo:incident

git switch stage/01-reconciliation-detection
npm test
npm run demo:incident
npm run demo:reconciliation

git switch stage/02-explicit-schema-validation
npm test
npm run demo:incident
npm run demo:reconciliation
npm run demo:validation

git switch stage/03-schema-compatible-transformer
npm test
npm run demo:forward-fix

git switch stage/04-idempotent-recovery
npm test
npm run demo:recovery
```

## Observed Output

These representative outputs were captured during the final verification run.

Stage 00 keeps the technical path green while fulfilment fails:

```text
Demo execution: PASS
Provider request: successful
Service execution: successful
Exceptions thrown: 0
Provider-reported records: 3
Payloads returned: 3
Records persisted: 0
Technical health: GREEN
Customer outcome: FAIL
Missing records: 3
```

Stage 01 reports the incident and then sweeps both active customers:

```text
Reported incident
customer-a: MISSING, 3 records missing

Active-customer sweep
customer-a: MISSING, 3 records missing
customer-b: MISSING, 2 records missing
```

Stage 02 accounts for every input without repairing the schema mismatch:

```text
Provider reported: 5
Received inputs: 5
Outcomes: 5
Persisted: 0
Explicitly rejected: 5
Unaccounted: 0
Excess outcomes: 0
Pipeline accountability: PASS
Customer fulfilment: FAIL
Stage 02 status: explicit accountability, not a complete repair
```

Stage 03 fixes forward processing only:

```text
Forward processing: FIXED
customer-a: 3 reported, 3 persisted
customer-b: 2 reported, 2 persisted
Rejected: 0
Unaccounted: 0
Pipeline accountability: PASS
Customer fulfilment: PASS
Historical recovery: OUTSTANDING
```

Stage 04 makes historical replay repeatable:

```text
First recovery
Retrieved: 5
Created: 5
Already existing: 0
Conflicts: 0

Second recovery
Retrieved: 5
Created: 0
Already existing: 5
Conflicts: 0

Final unique records: 5
Customer A fulfilment: PASS
Customer B fulfilment: PASS
Pipeline accountability: PASS
Duplicate records created: 0
```

The final verification covered 7 test files and 41 tests, all passing.

## Production Follow-ons

Production use would still need durable raw-event retention, provider contract monitoring, durable rejection storage and alerting, transactional persistence, service metrics, deployment infrastructure, and an explicit policy for conflicting canonical content. Those concerns are intentionally outside this deterministic example: it includes no HTTP server, queue, worker, scheduler, cloud resource, database, alerting platform, admin UI, or generic provider registry.