/**
 * @jest-environment node
 *
 * The owner's Share & people dialog went empty (no owner row, no invite form)
 * when the owner-only lookups failed — e.g. a database without the F1.3
 * migration. The member list must still load.
 */
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { listProjectMembers, listWorkspaceMembers } from "@/server/services/members";

jest.mock("../server/services/ownership-transfer", () => ({
  ...jest.requireActual("../server/services/ownership-transfer"),
  getPendingOutgoingTransfer: jest.fn(() =>
    Promise.reject(new Error("table ownership_transfers does not exist"))
  ),
}));

describe("F1.4 — members list survives failing owner-only lookups", () => {
  const id = `f14m_${Date.now().toString().slice(-7)}`;
  const actor: Actor = {
    userId: id,
    role: "USER",
    sessionId: `s_${id}`,
    email: `${id}@example.com`,
    name: "Owner",
  };
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    await db.user.create({
      data: { id, email: actor.email, name: "Owner", emailVerified: true },
    });
    workspaceId = (await db.workspace.create({ data: { title: "Solo", ownerId: id } })).id;
    projectId = (await db.project.create({ data: { name: "Solo P", ownerId: id } })).id;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { ownerId: id } });
    await db.project.deleteMany({ where: { ownerId: id } });
    await db.user.deleteMany({ where: { id } });
  });

  it("workspace: owner still gets the owner row and canManage", async () => {
    const res = await listWorkspaceMembers(actor, workspaceId);
    expect(res.owner.userId).toBe(id);
    expect(res.canManage).toBe(true);
    expect(res.outgoingTransfer).toBeNull();
  });

  it("project: owner still gets the owner row and canManage", async () => {
    const res = await listProjectMembers(actor, projectId);
    expect(res.canManage).toBe(true);
    expect(res.isOwner).toBe(true);
    expect(res.outgoingTransfer).toBeNull();
  });
});
