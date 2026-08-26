import { customerAFixtures } from "../../src/provider/stub-provider";

export const customerABaselineV1 = customerAFixtures.baselineV1;
export const customerAIncidentV2 = customerAFixtures.incidentV2;

export const malformedV2Payload = {
  transactionId: "txn-a-malformed-007",
  customerId: "customer-a",
  title: "",
} as const;
