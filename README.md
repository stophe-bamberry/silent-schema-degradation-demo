# Stage 02: Explicit schema validation

Boundary validation turns silent drops into explicit, attributable outcomes, while showing that accountable processing is not the same as customer fulfilment.

- **Checkout:** `stage/02-explicit-schema-validation`
- **Milestone tag:** `stage-02-explicit-schema-validation`
- **Previous:** `stage/01-reconciliation-detection`
- **Next:** `stage/03-schema-compatible-transformer`

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:validation
git switch stage/03-schema-compatible-transformer
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                               |
| ----------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| Earlier           | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.    |
| Earlier           | 01: Detection          | Independent reconciliation | Missing records become measurable.                    |
| **This checkout** | 02: Explicit failure   | Boundary validation        | Every unsupported payload has a rejected outcome.     |
| Later             | 03: Forward fix        | Compatible transformer     | Both provider schemas work for new processing.        |
| Later             | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates. |
| Later             | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected content is present.  |

The stage branch and matching tag identify this self-contained milestone in the simulated response.

## What changed and why

Zod validation now runs at the provider boundary. Each received input produces an explicit persisted or rejected outcome, with identity and a reason retained for rejections. Unsupported version 2 incident payloads are therefore rejected explicitly instead of disappearing.

All five inputs are accounted for, but none are persisted. This distinction prevents a green processing metric from being mistaken for a successful customer outcome.

## Evidence

`npm run demo:validation`:

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

Vitest passes **4 test files / 24 tests**.

## How it works

- [`provider-schema.ts`](src/provider/provider-schema.ts) defines the accepted provider payload contract with Zod.
- [`validated-transformer.ts`](src/provider/validated-transformer.ts) preserves input identity and returns either a canonical record or a rejected outcome with a reason.
- [`IngestionService`](src/pipeline/ingestion-service.ts) records one terminal outcome for each received input.
- [`ReconciliationService`](src/pipeline/reconciliation-service.ts) evaluates pipeline accountability separately from customer fulfilment.
- [`validation.ts`](src/demos/validation.ts) displays both measures for the same five-record incident.

Pipeline accountability asks whether every input has exactly one explainable outcome. Fulfilment asks whether the expected customer records exist.

## Remaining gap

The changed provider schema is now rejected visibly but still cannot be processed; Stage 03 adds a compatible transformer for both schema versions.
