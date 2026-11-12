/**
 * @jest-environment node
 *
 * The SupportTicket model had no migration, so a database built from the
 * migrations had no `support_tickets` table. The other support tests mock the
 * database; this one writes a real row.
 */

import { db } from "@/server/db/client";

describe("support_tickets table", () => {
  const suffix = Date.now().toString();
  const userId = `user_ticket_${suffix}`;
  let ticketId: string | null = null;

  afterAll(async () => {
    if (ticketId) {
      await db.supportTicket.delete({ where: { id: ticketId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.$disconnect();
  });

  it("stores a ticket and keeps it when its author's row is removed", async () => {
    await db.user.create({
      data: { id: userId, email: `${userId}@example.com`, name: "Ticket author" },
    });

    const ticket = await db.supportTicket.create({
      data: {
        userId,
        email: `${userId}@example.com`,
        topic: "billing",
        message: "A test request",
        diagnostics: { locale: "en" },
      },
    });
    ticketId = ticket.id;
    expect(ticket.status).toBe("OPEN");

    // ON DELETE SET NULL: the ticket stays, without its author.
    await db.user.delete({ where: { id: userId } });
    const kept = await db.supportTicket.findUnique({ where: { id: ticket.id } });
    expect(kept).not.toBeNull();
    expect(kept?.userId).toBeNull();
  });
});
