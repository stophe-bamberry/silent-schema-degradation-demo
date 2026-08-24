import { PROVIDER } from "../domain/meeting-record";
import type { MeetingRecord } from "../domain/meeting-record";
import type { ProviderPayload } from "./provider-payload";

export function transformLegacy(
  payload: ProviderPayload,
): MeetingRecord | undefined {
  if (!("meetingTitle" in payload) || !payload.meetingTitle) {
    return undefined;
  }

  return {
    provider: PROVIDER,
    customerId: payload.customerId,
    transactionId: payload.transactionId,
    title: payload.meetingTitle,
  };
}
