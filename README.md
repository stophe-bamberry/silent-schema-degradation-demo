# Silent Schema Degradation Demo

A deliberately small TypeScript demonstration of a provider schema change that silently drops customer records, followed by staged controls that detect, prevent, and recover from the failure.

The provider changes `meetingTitle` to `title`. The legacy transformer reads only `meetingTitle`, returns `undefined` for the new payload, and the legacy ingestion path ignores `undefined`. The request succeeds, no exception is thrown, technical health remains green, and customer fulfilment is wrong.

## Five-Minute Review

Requirements: Node.js 20 and npm.

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm run demo:all
```

The [recovery integration tests](tests/integration/recovery.test.ts) exercise wrong-content conflicts, malformed replay input, missing and substituted identities, partial progress, and safe retry. The [end-to-end tests](tests/e2e/incident-to-recovery.test.ts) cover both the staged implementation journey and a single repository moving from silent loss to verified recovery.

## Scenario

The stub provider has one provider, two customers, and explicit provider metadata:

- Customer A has three incident records.
- Customer B has two incident records.
- Both incident sets use the v2 `title` field.
- `txn-shared-005` appears once for each customer. The customer is part of the business identity, so these are two records.

The v1 baseline uses `meetingTitle`. The malformed v2 fixture has valid customer and transaction identities but an empty title, so validation can reject it without losing identity.

## Stage Journey

The journey has six sequential technical milestones. Stage 00 is the failure baseline; Stages 01–05 add progressively stronger controls. Each milestone has a matching branch, implementation commit, and annotated tag.

| Stage | Branch | Commit | Tag | Result |
| --- | --- | --- | --- | --- |
| 00 | `stage/00-silent-failure` | `demo: reproduce silent schema drift failure` | `stage-00-silent-failure` | Reproduces the silent drop. |
| 01 | `stage/01-reconciliation-detection` | `test: add independent reconciliation detection` | `stage-01-reconciliation-detection` | Detects missing fulfilment independently. |
| 02 | `stage/02-explicit-schema-validation` | `fix: make schema failures explicit` | `stage-02-explicit-schema-validation` | Rejects unsupported payloads explicitly with Zod. |
| 03 | `stage/03-schema-compatible-transformer` | `fix: support provider schema v2` | `stage-03-schema-compatible-transformer` | Maps v1 and v2 into one canonical record for new processing. |
| 04 | `stage/04-idempotent-recovery` | `feat: add idempotent historical recovery` | `stage-04-idempotent-recovery` | Recovers the historical gap safely and repeatably. |
| 05 | `stage/05-content-correct-recovery` | `fix: require accountable content-correct recovery` | `stage-05-content-correct-recovery` | Continues after individual failures and declares completion only after independent, content-aware reconciliation. |

Stages 00–04 were authored on 31 July 2026. Stage 05 was initially authored and opened for review on 20 August, then finalized on 31 August. That interval represents a later content-correctness hardening pass, not a missing implementation stage.

## Controls

### Stage 01: Reported incident

Stage 01 introduces outcome-level detection using provider metadata rather than transformer results or service health. Stage 05 strengthens this by supplying the expected canonical inventory separately from replay payload retrieval. A missing replay payload therefore cannot disappear from both sides of reconciliation.

### Stage 01: Active-customer sweep

The sweep obtains active customer expectations from the provider source and applies the same reconciliation to each. The stub's active-customer list is fixed for a deterministic demonstration; the reconciliation logic itself contains no customer-specific branches.

### Pipeline accountability

The ingestion path keeps received-input identities separate from processing outcomes. Every received input should have one matching terminal outcome: a new record is reported as `persisted`, an identical duplicate as `already-exists`, a malformed or unsupported payload as `rejected` with identity and reason, and a content mismatch at an existing identity as `conflict`. Conflicts never overwrite the original record and are never counted as persisted.

Accountability can therefore be `PASS` even when fulfilment fails: Stage 02 accounts for all five inputs as rejections, but persists none. `unaccountedCount` and `excessOutcomeCount` compare the independent identity sets; persistence counts describe outcome categories, not customer fulfilment.

```text
Pipeline accountability:
received replay inputs
= persisted + already-exists + rejected + conflict
(with no missing or excess outcomes)
```

### Provider compatibility boundary

The provider adapter owns strict schema checks and field-name differences:

- v1: `transactionId`, `customerId`, `meetingTitle`.
- v2: `transactionId`, `customerId`, `title`.
- Canonical output: `provider`, `customerId`, `transactionId`, and `title`.

The ingestion, repository, reconciliation, and recovery services do not inspect provider-specific field names.

The schemas reject unknown fields deliberately so drift becomes visible in this demonstration. A production integration should make the warn-versus-reject policy explicit for each provider contract; harmless additive fields may be accepted while still emitting a schema-change signal.

### Idempotent recovery

Repository identity is the structured tuple `[provider, customerId, transactionId]`. Historical recovery retrieves the explicit five-record incident scope and runs it through the same compatible ingestion behavior as forward processing. A repeated recovery returns `already-exists` only when both identity and canonical content match. The in-memory save preserves conflicting content and reports a `conflict` rather than overwriting it.

### Content-correct recovery

Stage 05 separates accountability from customer fulfilment:

```text
Customer fulfilment:
every independently expected canonical record
= one stored record with matching identity and content

Recovery complete:
accountability PASS
AND fulfilment PASS
AND expectation and replay-batch envelopes agree
AND expected identities are unique
AND rejected = 0
AND conflicts = 0
AND expected-but-not-retrieved = 0
AND unexpected-retrieved = 0
```

Accountability may pass while recovery remains incomplete. A malformed input is explicitly rejected while independent records continue processing. A conflicting occupant cannot satisfy fulfilment merely because its identity exists. Schema-valid content that disagrees with the expectation is rejected before persistence. Invalid or duplicate expectation identities, and any provider batch without one matching expectation envelope, prevent completion. An expected identity omitted from replay, or replaced by an unexpected identity, is detected even when the retrieved count still looks correct. Repeated delivery of an expected identity is safe: it produces `already-exists` after the first correct write without preventing completion.

## Run It

Install the committed dependency set:

```bash
npm ci
```

Run the final checks:

```bash
npm run format:check
npm run typecheck
npm test
npm run demo:all
```

Run only the final recovery demonstration:

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

git switch stage/05-content-correct-recovery
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
Historical recovery: DEFERRED TO STAGE 04
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

Stage 05 makes historical replay accountable, repeatable, and content-correct:

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

The final verification covered 7 test files and 55 tests, all passing. GitHub Actions also compiles and executes all five demonstrations as a smoke check; the test suite supplies the behavioral assertions.

## Production Follow-ons

This repository is a deterministic model of failure and recovery semantics, not a miniature production platform. It demonstrates silent schema degradation, separately supplied expectations, explicit per-input outcomes, content-aware idempotency, non-aborting replay, tenant-envelope validation, and strict recovery completion.

Production use would still need durable and concurrent persistence, cursor coordination, pagination, rate limiting, encrypted raw-event retention, least-privilege access, replay authorisation and auditing, durable quarantine storage, service metrics, alerts, and deployment controls. A Firestore implementation would enforce atomic create/precondition or transaction semantics. Retained transcript data would require encryption, access controls, auditability, redaction where appropriate, and a deletion policy.

Those concerns are intentionally outside this example: it includes no HTTP server, queue, worker, scheduler, cloud resource, database, alerting platform, admin UI, or generic provider registry.
