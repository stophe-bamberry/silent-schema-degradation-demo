import { PROVIDER } from "../domain/meeting-record";
import type { MeetingRecord } from "../domain/meeting-record";
import type {
  ProcessingInput,
  RejectedOutcome,
} from "../domain/processing-outcome";
import { transformLegacy } from "./legacy-transformer";
import { providerPayloadV1Schema } from "./provider-schema";

export type ValidatedTransformation =
  | { status: "transformed"; record: MeetingRecord }
  | { status: "rejected"; outcome: RejectedOutcome };

export function identifyProcessingInput(payload: unknown): ProcessingInput {
  const identity = readIdentity(payload);

  return {
    provider: PROVIDER,
    customerId: identity.customerId,
    transactionId: identity.transactionId,
  };
}

export function transformValidated(payload: unknown): ValidatedTransformation {
  const parsed = providerPayloadV1Schema.safeParse(payload);

  if (!parsed.success) {
    return {
      status: "rejected",
      outcome: createRejection(payload, formatValidationReason(parsed.error)),
    };
  }

  const record = transformLegacy(parsed.data);

  if (record === undefined) {
    return {
      status: "rejected",
      outcome: createRejection(parsed.data, "meetingTitle must be non-empty"),
    };
  }

  return { status: "transformed", record };
}

function createRejection(payload: unknown, reason: string): RejectedOutcome {
  return {
    ...identifyProcessingInput(payload),
    status: "rejected",
    reason,
  };
}

function readIdentity(payload: unknown): {
  customerId: string;
  transactionId: string;
} {
  if (!isRecord(payload)) {
    return { customerId: "unknown", transactionId: "unknown" };
  }

  return {
    customerId:
      typeof payload.customerId === "string" ? payload.customerId : "unknown",
    transactionId:
      typeof payload.transactionId === "string"
        ? payload.transactionId
        : "unknown",
  };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function formatValidationReason(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}
