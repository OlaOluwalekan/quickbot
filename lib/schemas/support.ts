import { z } from "zod";

export const supportTicketSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255),
  topic: z.string().trim().min(2).max(100),
  message: z.string().trim().min(10).max(5000),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
  website: z.string().optional(), // honeypot
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
