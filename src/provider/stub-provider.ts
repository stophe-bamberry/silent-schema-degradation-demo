import { PROVIDER } from "../domain/meeting-record";
import type {
  ProviderBatch,
  ProviderPayloadV1,
  ProviderPayloadV2,
} from "./provider-payload";

export type CustomerId = "customer-a" | "customer-b";

export const customerAFixtures = {
  baselineV1: [
    {
      transactionId: "txn-a-001",
      customerId: "customer-a",
      meetingTitle: "Quarterly review",
    },
    {
      transactionId: "txn-a-002",
      customerId: "customer-a",
      meetingTitle: "Leadership sync",
    },
  ] as const satisfies readonly ProviderPayloadV1[],
  incidentV2: [
    {
      transactionId: "txn-a-004",
      customerId: "customer-a",
      title: "Quarterly review",
    },
    {
      transactionId: "txn-shared-005",
      customerId: "customer-a",
      title: "Shared planning session",
    },
    {
      transactionId: "txn-a-006",
      customerId: "customer-a",
      title: "Renewal planning",
    },
  ] as const satisfies readonly ProviderPayloadV2[],
};

export const customerBFixtures = {
  baselineV1: [
    {
      transactionId: "txn-b-001",
      customerId: "customer-b",
      meetingTitle: "Quarterly review",
    },
    {
      transactionId: "txn-b-002",
      customerId: "customer-b",
      meetingTitle: "Leadership sync",
    },
  ] as const satisfies readonly ProviderPayloadV1[],
  incidentV2: [
    {
      transactionId: "txn-shared-005",
      customerId: "customer-b",
      title: "Shared planning session",
    },
    {
      transactionId: "txn-b-006",
      customerId: "customer-b",
      title: "Customer B review",
    },
  ] as const satisfies readonly ProviderPayloadV2[],
};

export class StubProvider {
  getBaselineBatch(customerId: CustomerId): ProviderBatch {
    const records =
      customerId === "customer-a"
        ? customerAFixtures.baselineV1
        : customerBFixtures.baselineV1;

    return this.createBatch(customerId, records, 2);
  }

  getCustomerAIncidentBatch(): ProviderBatch {
    return this.createBatch("customer-a", customerAFixtures.incidentV2, 3);
  }

  private createBatch(
    customerId: CustomerId,
    records: readonly (ProviderPayloadV1 | ProviderPayloadV2)[],
    reportedRecordCount: number,
  ): ProviderBatch {
    if (records.length !== reportedRecordCount) {
      throw new Error("Fixture count does not match provider metadata");
    }

    return {
      provider: PROVIDER,
      customerId,
      reportedRecordCount,
      records,
    };
  }
}
