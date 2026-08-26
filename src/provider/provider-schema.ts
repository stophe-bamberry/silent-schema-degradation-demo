import { z } from "zod";

export const providerPayloadV1Schema = z
  .object({
    transactionId: z.string().min(1),
    customerId: z.string().min(1),
    meetingTitle: z.string().min(1),
  })
  .strict();

export type ValidatedProviderPayloadV1 = z.infer<
  typeof providerPayloadV1Schema
>;

export const providerPayloadV2Schema = z
  .object({
    transactionId: z.string().min(1),
    customerId: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();

export type ValidatedProviderPayloadV2 = z.infer<
  typeof providerPayloadV2Schema
>;
