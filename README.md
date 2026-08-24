# Stage 01: Reconciliation detection

Independent reconciliation makes silent customer loss visible even when the ingestion path reports no error.

- **Checkout:** `stage/01-reconciliation-detection`
- **Milestone tag:** `stage-01-reconciliation-detection`
- **Previous:** `stage/00-silent-failure`
- **Next:** `stage/02-explicit-schema-validation`

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:reconciliation
git switch stage/02-explicit-schema-validation
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                               |
| ----------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| Earlier           | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.    |
| **This checkout** | 01: Detection          | Independent reconciliation | Missing records become measurable for both customers. |
| Later             | 02: Explicit failure   | Boundary validation        | Unsupported payloads become explicit outcomes.        |
| Later             | 03: Forward fix        | Compatible transformer     | Both provider schemas work for new processing.        |
| Later             | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates. |
| Later             | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected content is present.  |

The stage branch and matching tag identify this self-contained milestone in the simulated response.

## What changed and why

Reconciliation compares provider-reported volume with records persisted for the same provider, customer, and incident transaction IDs. This expectation is kept separate from transformer and persistence outcomes, so a technically successful ingestion cannot define its own success.

A sweep applies the same comparison to every active customer batch. It detects three missing records for Customer A and two for Customer B without customer-specific branching.

## Evidence

`npm run demo:reconciliation`:

```text
Reported incident
customer-a: MISSING, 3 records missing

Active-customer sweep
customer-a: MISSING, 3 records missing
customer-b: MISSING, 2 records missing
```

Vitest passes **2 test files / 15 tests**.

## How it works

- [`ReconciliationService`](src/pipeline/reconciliation-service.ts) scopes persisted counts to provider, customer, and incident transaction IDs, then reports `PASS`, `MISSING`, or `SURPLUS`.
- [`StubProvider`](src/provider/stub-provider.ts) supplies reported counts and active-customer batches separately from processing outcomes.
- [`InMemoryRecordRepository`](src/persistence/in-memory-record-repository.ts) answers the scoped persistence query.
- [`reconciliation.ts`](src/demos/reconciliation.ts) demonstrates the reported incident and active-customer sweep.

Reconciliation is an independent comparison between expected and observed business state; it does not rely on request success as evidence of fulfilment.

## Remaining gap

Detection exposes the customer impact but does not make unsupported payloads explicit at processing time; Stage 02 adds boundary validation and accountable outcomes.
