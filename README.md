# Stage 05: Content-correct recovery

This final stage of the Silent Schema Degradation Demo makes recovery complete only when processing is accountable and every independently expected customer record exists with the correct content.

- **Checkout:** `main` or `stage/05-content-correct-recovery`
- **Milestone tag:** `stage-05-content-correct-recovery`
- **Previous:** `stage/04-idempotent-recovery`
- **Next:** complete journey

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:all
git switch stage/04-idempotent-recovery
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                                        |
| ----------------- | ---------------------- | -------------------------- | -------------------------------------------------------------- |
| Earlier           | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.             |
| Earlier           | 01: Detection          | Independent reconciliation | Missing records become measurable.                             |
| Earlier           | 02: Explicit failure   | Boundary validation        | Unsupported payloads become explicit outcomes.                 |
| Earlier           | 03: Forward fix        | Compatible transformer     | Both provider schemas work for new processing.                 |
| Earlier           | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates.          |
| **This checkout** | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected identities and content match. |

The stage branch and matching tag identify this self-contained final milestone in the simulated response.

## What changed and why

Idempotency proves that retry is safe, but counts and matching identities can still hide wrong content, omitted records, substituted records, or unexplained processing outcomes. Stage 05 supplies the expected canonical inventory separately from replay payload retrieval and reconciles stored records against that expectation.

Recovery continues after an individual rejection or conflict so the report captures the whole incident scope. Completion requires all of these conditions:

- every replay input has exactly one persisted, already-correct, rejected, or conflict outcome;
- every expected identity was retrieved, with no unexpected replacement;
- expectation identities are valid and unique, and each provider/customer replay batch has exactly one matching expectation with the same reported count;
- rejected and conflict counts are zero;
- every expected canonical record exists with matching identity and content.

This separates two questions: pipeline accountability asks whether every input has an explainable outcome; customer fulfilment asks whether the customer is whole.

## Evidence

The final section of `npm run demo:all`:

```text
First recovery
Expected: 5
Retrieved: 5
Created: 5
Already correct: 0
Rejected: 0
Conflicts: 0
Pipeline accountability: PASS
Recovery complete: true

Second recovery
Expected: 5
Retrieved: 5
Created: 0
Already correct: 5
Rejected: 0
Conflicts: 0
Pipeline accountability: PASS
Recovery complete: true

Correct incident records: 5
customer-a fulfilment: PASS
customer-b fulfilment: PASS
Duplicate records created: 0
```

Vitest passes **7 files / 55 tests**. The integration tests cover wrong-content conflicts, malformed replay input, missing and substituted identities, partial progress, and safe retry. The end-to-end tests exercise both the staged journey and one repository moving from silent loss to verified recovery.

## How it works

- [`RecoveryService`](src/pipeline/recovery-service.ts) compares independent expectations with replay inventory, aggregates processing outcomes, and decides whether recovery is complete.
- [`ReconciliationService`](src/pipeline/reconciliation-service.ts) evaluates accountability and content-aware customer fulfilment separately.
- [`IngestionService`](src/pipeline/ingestion-service.ts) returns an explicit terminal outcome for every input and never overwrites conflicting content.
- [`StubProvider`](src/provider/stub-provider.ts) keeps expected canonical records separate from historical replay batches for this deterministic demonstration.
- [`recovery.test.ts`](tests/integration/recovery.test.ts) and [`incident-to-recovery.test.ts`](tests/e2e/incident-to-recovery.test.ts) provide the primary behavioral evidence.

A canonical record is the provider-neutral internal model. In production, its expected inventory would need an operationally independent source rather than this deterministic stub.

## Production boundary

This repository models failure and recovery semantics, not a deployable service. Production use would additionally require durable concurrent persistence, replay coordination, pagination, rate limiting, secure raw-event retention, auditing, metrics, alerts, and deployment controls.
