import type { ZodIssue } from "zod";
import { PROVIDER } from "../domain/meeting-record";
import type { MeetingRecord } from "../domain/meeting-record";
import type { RejectedOutcome } from "../domain/processing-outcome";
import {
  providerPayloadV1Schema,
  providerPayloadV2Schema,
} from "./provider-schema";
import { identifyProcessingInput } from "./validated-transformer";

export type CompatibleTransformation =
  | { status: "transformed"; record: MeetingRecord }
  | { status: "rejected"; outcome: RejectedOutcome };

export function transformCompatible(
  payload: unknown,
): CompatibleTransformation {
  const versionOne = providerPayloadV1Schema.safeParse(payload);

  if (versionOne.success) {
    return {
      status: "transformed",
      record: {
        provider: PROVIDER,
        customerId: versionOne.data.customerId,
        transactionId: versionOne.data.transactionId,
        title: versionOne.data.meetingTitle,
      },
    };
  }

  const versionTwo = providerPayloadV2Schema.safeParse(payload);

  if (versionTwo.success) {
    return {
      status: "transformed",
      record: {
        provider: PROVIDER,
        customerId: versionTwo.data.customerId,
        transactionId: versionTwo.data.transactionId,
        title: versionTwo.data.title,
      },
    };
  }

  return {
    status: "rejected",
    outcome: createRejection(
      payload,
      formatValidationReason(versionTwo.error.issues),
    ),
  };
}

function createRejection(payload: unknown, reason: string): RejectedOutcome {
  return {
    ...identifyProcessingInput(payload),
    status: "rejected",
    reason,
  };
}

function formatValidationReason(issues: readonly ZodIssue[]): string {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}
