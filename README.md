# Stage 03: Schema-compatible forward processing

A provider adapter now accepts both schema versions and maps them into one canonical record, restoring new processing without pretending the historical gap is repaired.

- **Checkout:** `stage/03-schema-compatible-transformer`
- **Milestone tag:** `stage-03-schema-compatible-transformer`
- **Previous:** `stage/02-explicit-schema-validation`
- **Next:** `stage/04-idempotent-recovery`

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:forward-fix
git switch stage/04-idempotent-recovery
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                               |
| ----------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| Earlier           | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.    |
| Earlier           | 01: Detection          | Independent reconciliation | Missing records become measurable.                    |
| Earlier           | 02: Explicit failure   | Boundary validation        | Unsupported payloads become explicit outcomes.        |
| **This checkout** | 03: Forward fix        | Compatible transformer     | Both schemas work for new processing.                 |
| Later             | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates. |
| Later             | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected content is present.  |

The stage branch and matching tag identify this self-contained milestone in the simulated response.

## What changed and why

The provider adapter validates either version 1 (`meetingTitle`) or version 2 (`title`) and maps both to the stable internal `title` field. Provider-specific schema differences remain at the boundary; ingestion, persistence, and reconciliation continue to use the canonical model.

The fix restores fulfilment for records processed after deployment. It deliberately does not claim that records lost before deployment have been recovered.

## Evidence

`npm run demo:forward-fix`:

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

Vitest passes **4 test files / 30 tests**.

## How it works

- [`provider-schema.ts`](src/provider/provider-schema.ts) defines both provider payload versions.
- [`compatible-transformer.ts`](src/provider/compatible-transformer.ts) validates each version and maps it into the canonical meeting-record shape.
- [`IngestionService`](src/pipeline/ingestion-service.ts) consumes transformation outcomes without inspecting provider field names.
- [`forward-fix.ts`](src/demos/forward-fix.ts) proves accountable, fulfilled processing for both active customers.

A canonical record is the provider-neutral internal model used by the rest of the system.

## Remaining gap

Forward compatibility stops new loss but leaves the incident window incomplete; Stage 04 replays that historical scope through an idempotent persistence path.
