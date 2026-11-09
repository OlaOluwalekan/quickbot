/**
 * @jest-environment node
 */

import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { requireProject } from "@/server/authz/access";
import {
  getProject,
  getProjectWorkspaces,
  listMovableWorkspaces,
} from "@/server/services/project";
import { createWorkspace } from "@/server/services/workspace";

describe("Step F1.4 — Project page (/projects/[id])", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    owner: `f14_o_${sfx}`,
    viewer: `f14_v_${sfx}`,
    editor: `f14_e_${sfx}`,
    stranger: `f14_s_${sfx}`,
  };
  const allIds = Object.values(ids);
  const email = (k: keyof typeof ids) => `${k}_${sfx}@example.com`;
  const actorFor = (k: keyof typeof ids): Actor => ({
    userId: ids[k],
    role: "USER",
    sessionId: `sess_${k}_${sfx}`,
    email: email(k),
    name: k,
  });

  let emptyProjectId = "";
  let populatedProjectId = "";
  let wsAlphaId = "";
  let wsBetaId = "";

  async function cleanup() {
    await db.workspaceMember.deleteMany({ where: { userId: { in: allIds } } });
    await db.projectMember.deleteMany({ where: { userId: { in: allIds } } });
    await db.workspace.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.project.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.user.deleteMany({ where: { id: { in: allIds } } });
  }

  beforeAll(async () => {
    await cleanup();

    await db.user.createMany({
      data: (Object.keys(ids) as Array<keyof typeof ids>).map((k) => ({
        id: ids[k],
        email: email(k),
        name: k,
        emailVerified: true,
        username: `${k}${sfx}`.toLowerCase(),
        displayUsername: `${k}${sfx}`.toLowerCase(),
      })),
    });

    // 1. Populated Project with 2 workspaces
    const populatedProj = await db.project.create({
      data: {
        name: `Alpha Project ${sfx}`,
        description: "Test populated project",
        ownerId: ids.owner,
      },
    });
    populatedProjectId = populatedProj.id;

    // Add viewer member
    await db.projectMember.create({
      data: {
        projectId: populatedProjectId,
        userId: ids.viewer,
        role: "VIEWER",
        invitedById: ids.owner,
      },
    });

    // Add editor member
    await db.projectMember.create({
      data: {
        projectId: populatedProjectId,
        userId: ids.editor,
        role: "EDITOR",
        invitedById: ids.owner,
      },
    });

    // Create 2 workspaces in populated project
    const ws1 = await db.workspace.create({
      data: {
        title: "Beta Research Workspace",
        ownerId: ids.owner,
        projectId: populatedProjectId,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastActivityAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    wsBetaId = ws1.id;

    const ws2 = await db.workspace.create({
      data: {
        title: "Alpha Notes Workspace",
        ownerId: ids.owner,
        projectId: populatedProjectId,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        lastActivityAt: new Date("2026-01-02T10:00:00Z"),
      },
    });
    wsAlphaId = ws2.id;

    // 2. Empty Project
    const emptyProj = await db.project.create({
      data: {
        name: `Empty Project ${sfx}`,
        description: "Test empty project",
        ownerId: ids.owner,
      },
    });
    emptyProjectId = emptyProj.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("1. Access Control & stranger protection", () => {
    it("a stranger gets notFound (404) on project read (never 403 / no existence leak)", async () => {
      await expect(
        requireProject(actorFor("stranger"), populatedProjectId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
      });

      await expect(
        getProject(actorFor("stranger"), populatedProjectId)
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it("a project member with VIEWER sees the page read-only", async () => {
      const project = await getProject(actorFor("viewer"), populatedProjectId);
      expect(project.id).toBe(populatedProjectId);
      expect(project.role).toBe("VIEWER");
      // VIEWER has read permission
      expect(project.capabilities).toContain("workspace.read");
      // VIEWER does NOT have generate/create permission
      expect(project.capabilities).not.toContain("workspace.generate");
      expect(project.capabilities).not.toContain("workspace.rename");
      expect(project.capabilities).not.toContain("workspace.delete");
    });

    it("project owner has full capabilities including rename and delete", async () => {
      const project = await getProject(actorFor("owner"), populatedProjectId);
      expect(project.role).toBe("OWNER");
      expect(project.capabilities).toContain("workspace.read");
      expect(project.capabilities).toContain("workspace.rename");
      expect(project.capabilities).toContain("workspace.delete");
    });
  });

  describe("1b. Workspace list authorization and per-row capabilities", () => {
    it("a stranger gets 404 on the project's workspace list", async () => {
      await expect(
        getProjectWorkspaces(actorFor("stranger"), populatedProjectId, {
          limit: 10,
        })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("does not expose member email addresses", async () => {
      const project = await getProject(actorFor("viewer"), populatedProjectId);
      expect(project.owner).not.toHaveProperty("email");
      for (const m of project.members) {
        expect(m.user).not.toHaveProperty("email");
      }
      const page = await getProjectWorkspaces(
        actorFor("viewer"),
        populatedProjectId,
        { limit: 10 }
      );
      for (const w of page.items) {
        expect(w.owner).not.toHaveProperty("email");
        expect(w).not.toHaveProperty("members");
      }
    });

    it("VIEWER rows are read-only; workspace owner rows have every capability", async () => {
      const asViewer = await getProjectWorkspaces(
        actorFor("viewer"),
        populatedProjectId,
        { limit: 10 }
      );
      for (const w of asViewer.items) {
        expect(w.capabilities).toEqual(["workspace.read"]);
      }

      const asOwner = await getProjectWorkspaces(
        actorFor("owner"),
        populatedProjectId,
        { limit: 10 }
      );
      for (const w of asOwner.items) {
        expect(w.capabilities).toContain("workspace.delete");
      }
    });

    it("a workspace-level role adds rights on that row only (top-down)", async () => {
      await db.workspaceMember.create({
        data: {
          workspaceId: wsBetaId,
          userId: ids.editor,
          role: "ADMIN",
          invitedById: ids.owner,
        },
      });
      try {
        const page = await getProjectWorkspaces(
          actorFor("editor"),
          populatedProjectId,
          { limit: 10 }
        );
        const beta = page.items.find((w) => w.id === wsBetaId)!;
        const alpha = page.items.find((w) => w.id === wsAlphaId)!;
        expect(beta.capabilities).toContain("workspace.rename");
        expect(alpha.capabilities).toContain("workspace.generate");
        expect(alpha.capabilities).not.toContain("workspace.rename");
        expect(alpha.capabilities).not.toContain("workspace.delete");
      } finally {
        await db.workspaceMember.deleteMany({
          where: { workspaceId: wsBetaId, userId: ids.editor },
        });
      }
    });

    it("paginates with a cursor without repeating rows", async () => {
      const first = await getProjectWorkspaces(
        actorFor("owner"),
        populatedProjectId,
        { limit: 1, sort: "name" }
      );
      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).toBe(first.items[0]!.id);
      const second = await getProjectWorkspaces(
        actorFor("owner"),
        populatedProjectId,
        { limit: 1, sort: "name", cursor: first.nextCursor! }
      );
      expect(second.items).toHaveLength(1);
      expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe("2. Populated and empty states", () => {
    it("returns empty workspace list for empty project", async () => {
      const page = await getProjectWorkspaces(actorFor("owner"), emptyProjectId, {
        limit: 10,
      });
      expect(page.items).toHaveLength(0);
      expect(page.nextCursor).toBeNull();
    });

    it("returns all project workspaces with owner metadata and response counts", async () => {
      const page = await getProjectWorkspaces(actorFor("owner"), populatedProjectId, {
        limit: 10,
      });
      expect(page.items).toHaveLength(2);

      const wsItem = page.items.find((w) => w.id === wsAlphaId);
      expect(wsItem).toBeDefined();
      expect(wsItem?.owner?.id).toBe(ids.owner);
      expect(wsItem?.title).toBe("Alpha Notes Workspace");
      expect(wsItem?._count?.responses).toBeDefined();
    });
  });

  describe("3. Search and Sort in getProjectWorkspaces", () => {
    it("filters workspaces by query (q)", async () => {
      const pageAlpha = await getProjectWorkspaces(actorFor("owner"), populatedProjectId, {
        q: "Alpha",
        limit: 10,
      });
      expect(pageAlpha.items).toHaveLength(1);
      expect(pageAlpha.items[0]!.id).toBe(wsAlphaId);

      const pageBeta = await getProjectWorkspaces(actorFor("owner"), populatedProjectId, {
        q: "Beta",
        limit: 10,
      });
      expect(pageBeta.items).toHaveLength(1);
      expect(pageBeta.items[0]!.id).toBe(wsBetaId);
    });

    it("sorts workspaces by name asc", async () => {
      const page = await getProjectWorkspaces(actorFor("owner"), populatedProjectId, {
        sort: "name",
        limit: 10,
      });
      expect(page.items).toHaveLength(2);
      // "Alpha Notes Workspace" before "Beta Research Workspace"
      expect(page.items[0]!.title).toBe("Alpha Notes Workspace");
      expect(page.items[1]!.title).toBe("Beta Research Workspace");
    });

    it("sorts workspaces by lastActivity desc", async () => {
      const page = await getProjectWorkspaces(actorFor("owner"), populatedProjectId, {
        sort: "lastActivity",
        limit: 10,
      });
      expect(page.items).toHaveLength(2);
      // wsAlpha had lastActivity Jan 2, wsBeta Jan 1 -> wsAlpha first
      expect(page.items[0]!.id).toBe(wsAlphaId);
      expect(page.items[1]!.id).toBe(wsBetaId);
    });
  });

  describe("4. Creating workspace inside project", () => {
    it("creating with projectId creates a workspace already inside the project", async () => {
      const created = await createWorkspace(actorFor("owner"), {
        title: "New In Project",
        projectId: emptyProjectId,
      });

      expect(created.projectId).toBe(emptyProjectId);
      expect(created.ownerId).toBe(ids.owner);

      // Verify it now appears in project workspaces
      const page = await getProjectWorkspaces(actorFor("owner"), emptyProjectId, {
        limit: 10,
      });
      expect(page.items.some((w) => w.id === created.id)).toBe(true);
    });
  });

  describe("5. Moving an existing workspace in (only ones the user may move)", () => {
    let soloId = "";
    let editorOnlyId = "";
    let adminOnId = "";

    beforeAll(async () => {
      soloId = (
        await db.workspace.create({
          data: { title: `Editor Solo ${sfx}`, ownerId: ids.editor },
        })
      ).id;
      editorOnlyId = (
        await db.workspace.create({
          data: { title: `Shared As Editor ${sfx}`, ownerId: ids.owner },
        })
      ).id;
      adminOnId = (
        await db.workspace.create({
          data: { title: `Shared As Admin ${sfx}`, ownerId: ids.owner },
        })
      ).id;
      await db.workspaceMember.createMany({
        data: [
          { workspaceId: editorOnlyId, userId: ids.editor, role: "EDITOR", invitedById: ids.owner },
          { workspaceId: adminOnId, userId: ids.editor, role: "ADMIN", invitedById: ids.owner },
        ],
      });
    });

    it("lists only workspaces the user can rename, outside this project", async () => {
      const { items } = await listMovableWorkspaces(
        actorFor("editor"),
        populatedProjectId,
        {}
      );
      const got = items.map((w) => w.id);
      expect(got).toContain(soloId);
      expect(got).toContain(adminOnId);
      expect(got).not.toContain(editorOnlyId); // EDITOR can't rename
      expect(got).not.toContain(wsAlphaId); // already in this project
      expect(items.length).toBeLessThanOrEqual(10);
    });

    it("filters by q", async () => {
      const { items } = await listMovableWorkspaces(
        actorFor("editor"),
        populatedProjectId,
        { q: "editor solo" }
      );
      expect(items.map((w) => w.id)).toEqual([soloId]);
    });

    it("project workspaces the owner manages are offered for another project", async () => {
      const { items } = await listMovableWorkspaces(
        actorFor("owner"),
        emptyProjectId,
        {}
      );
      const got = items.map((w) => w.id);
      expect(got).toEqual(expect.arrayContaining([wsAlphaId, wsBetaId]));
      expect(items.find((w) => w.id === wsAlphaId)?.project?.id).toBe(
        populatedProjectId
      );
    });

    it("VIEWER gets 403 and a stranger 404", async () => {
      await expect(
        listMovableWorkspaces(actorFor("viewer"), populatedProjectId, {})
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        listMovableWorkspaces(actorFor("stranger"), populatedProjectId, {})
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
