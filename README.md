# Stage 00: Silent failure

A provider schema change can lose customer records while requests, exceptions, and service health all remain green.

- **Checkout:** `stage/00-silent-failure`
- **Milestone tag:** `stage-00-silent-failure`
- **Previous:** none (failure baseline)
- **Next:** `stage/01-reconciliation-detection`

> **Simulation note:** This sequence and its one-week timeline illustrate one way the incident response may have played out. They are not an actual incident record or delivery estimate; real timing would depend on the people available, the production codebase, provider behavior, and integration complexity.

## How to use this repository

Requires Node.js 20 and npm.

```bash
npm ci
npm run format:check && npm run typecheck && npm test
npm run demo:incident
git switch stage/01-reconciliation-detection
git switch main
```

## Journey

| Position          | Stage                  | Control                    | Outcome                                               |
| ----------------- | ---------------------- | -------------------------- | ----------------------------------------------------- |
| **This checkout** | 00: Silent failure     | Legacy transformer         | Three provider records disappear without an error.    |
| Later             | 01: Detection          | Independent reconciliation | Missing records become measurable.                    |
| Later             | 02: Explicit failure   | Boundary validation        | Unsupported payloads become explicit outcomes.        |
| Later             | 03: Forward fix        | Compatible transformer     | Both provider schemas work for new processing.        |
| Later             | 04: Safe recovery      | Idempotent replay          | Historical records can be retried without duplicates. |
| Later             | 05: Correct completion | Accountable reconciliation | Recovery ends only when expected content is present.  |

The stage branch and matching tag identify this self-contained milestone in the simulated response.

## What changed and why

This baseline deliberately models a fragile integration. The provider returns version 2 payloads during an incident, but the legacy transformer only understands version 1. It returns `undefined` for the new shape, and ingestion treats that as a record to skip rather than a failed outcome.

The customer consequence is concrete: three expected records are absent even though the provider request and service execution both succeed.

## Evidence

`npm run demo:incident`:

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

Vitest passes **1 test file / 5 tests**, including three cases that prove incident payloads are silently dropped without throwing.

## How it works

- [`StubProvider`](src/provider/stub-provider.ts) supplies a deterministic incident batch containing the changed provider payloads.
- [`LegacyTransformer`](src/provider/legacy-transformer.ts) maps the original schema into the internal meeting-record model and silently rejects the changed schema.
- [`IngestionService`](src/pipeline/ingestion-service.ts) persists only records returned by that transformer.
- [`incident.ts`](src/demos/incident.ts) compares provider-reported volume with persisted volume while showing that technical health remains green.

A canonical record is the stable internal model used after provider-specific data has been transformed.

## Remaining gap

The system has no independent way to compare what the provider says should exist with what was actually persisted; Stage 01 adds that detection control.
