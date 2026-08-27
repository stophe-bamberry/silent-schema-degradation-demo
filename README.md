# Stage 04: Idempotent historical recovery

Historical replay restores the five missing records and can be repeated without creating duplicates.

- **Checkout:** `stage/04-idempotent-recovery`
- **Milestone tag:** `stage-04-idempotent-recovery`
- **Previous:** `stage/03-schema-compatible-transformer`
- **Next:** `stage/05-content-correct-recovery`

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:recovery
git switch stage/05-content-correct-recovery
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                               |
| ----------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| Earlier           | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.    |
| Earlier           | 01: Detection          | Independent reconciliation | Missing records become measurable.                    |
| Earlier           | 02: Explicit failure   | Boundary validation        | Unsupported payloads become explicit outcomes.        |
| Earlier           | 03: Forward fix        | Compatible transformer     | Both provider schemas work for new processing.        |
| **This checkout** | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates. |
| Later             | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected content is present.  |

The stage branch and matching tag identify this self-contained milestone in the simulated response.

## What changed and why

Recovery retrieves the explicit incident window, transforms it through the compatible provider boundary, and uses the same identity-aware persistence operation as normal processing. Record identity is provider, customer, and transaction ID; identical retries return `already-exists`, while different content at an existing identity is a conflict rather than an overwrite.

The first replay creates five records. The second replay retrieves the same five and creates none, making retry safe after interruption or uncertain completion.

## Evidence

`npm run demo:recovery`:

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

Vitest passes **7 test files / 41 tests**.

## How it works

- [`RecoveryService`](src/pipeline/recovery-service.ts) retrieves the historical batches, transforms each payload, and summarizes created, existing, and conflicting outcomes.
- [`InMemoryRecordRepository`](src/persistence/in-memory-record-repository.ts) enforces identity-aware, idempotent persistence.
- [`compatible-transformer.ts`](src/provider/compatible-transformer.ts) keeps replay on the same provider boundary as forward processing.
- [`recovery.ts`](src/demos/recovery.ts) runs the same recovery twice and reconciles the resulting customer state.

Idempotency answers whether retrying the same operation is safe; it does not by itself prove that every expected record has the correct content.

## Remaining gap

Count-based fulfilment and duplicate-free replay can still miss wrong content or unexplained outcomes; Stage 05 makes completion accountable and content-correct.
