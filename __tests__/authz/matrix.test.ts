/**
 * @jest-environment node
 */
const mockWorkspaceFindFirst = jest.fn();
const mockProjectMemberFindUnique = jest.fn();
const mockProjectFindFirst = jest.fn();

jest.mock("../../server/db/client", () => ({
  db: {
    workspace: {
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
    },
    projectMember: {
      findUnique: (...args: unknown[]) => mockProjectMemberFindUnique(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}));

import {
  ALL_PERMISSIONS,
  can,
  type Permission,
  type RoleWithNone,
} from "@/server/authz/permissions";
import {
  requireProject,
  requireWorkspace,
  resolveProjectRole,
  resolveWorkspaceRole,
} from "@/server/authz/access";
import type { Actor } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";

describe("Authorization Service & Permission Matrix (Step 1.5)", () => {
  const userA: Actor = {
    userId: "01966f0c-7c2a-7000-8000-00000000000a",
    role: "USER",
    sessionId: "sess_a",
    email: "alice@example.com",
  };

  const userB: Actor = {
    userId: "01966f0c-7c2a-7000-8000-00000000000b",
    role: "USER",
    sessionId: "sess_b",
    email: "bob@example.com",
  };

  const wsId = "01966f0c-7c2a-7000-8000-000000000100";
  const projId = "01966f0c-7c2a-7000-8000-000000000200";

  beforeEach(() => {
    mockWorkspaceFindFirst.mockReset();
    mockProjectMemberFindUnique.mockReset();
    mockProjectFindFirst.mockReset();
  });

  describe("1. Appendix A Permission Matrix (role × permission)", () => {
    const expectedByRole: Record<RoleWithNone, readonly Permission[]> = {
      NONE: [],
      VIEWER: ["workspace.read"],
      COMMENTER: ["workspace.read", "workspace.annotate"],
      EDITOR: [
        "workspace.read",
        "workspace.annotate",
        "workspace.generate",
        "workspace.regenerate",
        "workspace.edit_response",
        "workspace.upload",
        "workspace.export",
      ],
      ADMIN: [
        "workspace.read",
        "workspace.annotate",
        "workspace.generate",
        "workspace.regenerate",
        "workspace.edit_response",
        "workspace.upload",
        "workspace.export",
        "workspace.rename",
        "workspace.archive",
        "workspace.share",
        "workspace.manage_members",
      ],
      OWNER: ALL_PERMISSIONS,
    };

    const matrixRows: Array<[RoleWithNone, Permission, boolean]> = [];
    for (const role of Object.keys(expectedByRole) as RoleWithNone[]) {
      const allowedSet = new Set(expectedByRole[role]);
      for (const perm of ALL_PERMISSIONS) {
        matrixRows.push([role, perm, allowedSet.has(perm)]);
      }
    }

    it.each(matrixRows)(
      "can(%s, %s) -> %s",
      (role, perm, expectedAllowed) => {
        expect(can(role, perm)).toBe(expectedAllowed);
      }
    );

    it("denies all permissions for null or undefined role", () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(can(null, perm)).toBe(false);
        expect(can(undefined, perm)).toBe(false);
      }
    });
  });

  describe("2. Role precedence & inheritance (D-02: owner > explicit workspace role > project role > none)", () => {
    it("resolves OWNER when userId matches ws.ownerId regardless of member rows", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: projId,
        archivedAt: null,
        members: [{ role: "VIEWER" }],
      });

      const resolved = await resolveWorkspaceRole(userA.userId, wsId);
      expect(resolved).toEqual({
        ws: {
          id: wsId,
          ownerId: userA.userId,
          projectId: projId,
          archivedAt: null,
        },
        role: "OWNER",
      });
      expect(mockProjectMemberFindUnique).not.toHaveBeenCalled();
    });

    it("inherits project role when workspace belongs to a project and user has no explicit workspace member row", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: projId,
        archivedAt: null,
        members: [],
      });
      mockProjectMemberFindUnique.mockResolvedValue({
        role: "EDITOR",
      });

      const resolved = await resolveWorkspaceRole(userB.userId, wsId);
      expect(resolved?.role).toBe("EDITOR");
      expect(mockProjectMemberFindUnique).toHaveBeenCalledWith({
        where: {
          projectId_userId: { projectId: projId, userId: userB.userId },
        },
        select: { role: true },
      });
    });

    it("explicit workspace role overrides inherited project role (upgrade or downgrade)", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: projId,
        archivedAt: null,
        members: [{ role: "COMMENTER" }],
      });
      mockProjectMemberFindUnique.mockResolvedValue({
        role: "ADMIN",
      });

      const resolved = await resolveWorkspaceRole(userB.userId, wsId);
      expect(resolved?.role).toBe("COMMENTER");
      expect(mockProjectMemberFindUnique).not.toHaveBeenCalled();
    });

    it("explicit WorkspaceRole.NONE excludes a project member from that workspace (returns null / 404)", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: projId,
        archivedAt: null,
        members: [{ role: "NONE" }],
      });
      mockProjectMemberFindUnique.mockResolvedValue({
        role: "ADMIN",
      });

      const resolved = await resolveWorkspaceRole(userB.userId, wsId);
      expect(resolved).toBeNull();

      await expect(
        requireWorkspace(userB, wsId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("removing a user from a project removes inherited access unless they have an explicit workspace row", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: projId,
        archivedAt: null,
        members: [],
      });
      // Project membership removed -> findUnique returns null
      mockProjectMemberFindUnique.mockResolvedValue(null);

      const resolved = await resolveWorkspaceRole(userB.userId, wsId);
      expect(resolved).toBeNull();
    });
  });

  describe("3. Existence privacy (404 vs 403), soft-delete, and archive rules", () => {
    it("proves user B gets 404 (never 403) on user A's workspace ID and project ID", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
        members: [],
      });

      try {
        await requireWorkspace(userB, wsId, "workspace.read");
        throw new Error("Expected requireWorkspace to throw 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe("not_found");
      }

      mockProjectFindFirst.mockResolvedValue({
        id: projId,
        ownerId: userA.userId,
        archivedAt: null,
        members: [],
      });

      await expect(
        requireProject(userB, projId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("returns 403 Forbidden when user B is a VIEWER on user A's workspace and attempts a mutation", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
        members: [{ role: "VIEWER" }],
      });

      await expect(
        requireWorkspace(userB, wsId, "workspace.read")
      ).resolves.toMatchObject({ role: "VIEWER" });

      await expect(
        requireWorkspace(userB, wsId, "workspace.generate")
      ).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });
    });

    it("returns 404 for soft-deleted workspaces and projects even for the owner", async () => {
      // Soft-deleted rows are filtered out by `where: { id, deletedAt: null }`
      mockWorkspaceFindFirst.mockImplementation(
        async (args: { where?: { deletedAt?: unknown } }) => {
          expect(args.where).toEqual({ id: wsId, deletedAt: null });
          return null;
        }
      );

      await expect(
        requireWorkspace(userA, wsId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });

      mockProjectFindFirst.mockImplementation(
        async (args: { where?: { deletedAt?: unknown } }) => {
          expect(args.where).toEqual({ id: projId, deletedAt: null });
          return null;
        }
      );

      await expect(
        requireProject(userA, projId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("enforces archived workspace/project conflict (409) on mutations except workspace.read and workspace.archive", async () => {
      const archivedDate = new Date("2026-10-01T00:00:00Z");
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: null,
        archivedAt: archivedDate,
        members: [],
      });

      // Owner can still read and unarchive (workspace.archive)
      await expect(
        requireWorkspace(userA, wsId, "workspace.read")
      ).resolves.toMatchObject({ role: "OWNER" });
      await expect(
        requireWorkspace(userA, wsId, "workspace.archive")
      ).resolves.toMatchObject({ role: "OWNER" });

      // Any other permission on an archived workspace throws 409 Conflict
      for (const perm of ALL_PERMISSIONS) {
        if (perm === "workspace.read" || perm === "workspace.archive") continue;
        await expect(
          requireWorkspace(userA, wsId, perm)
        ).rejects.toMatchObject({
          status: 409,
          code: "conflict",
          message: "Workspace is archived",
        });
      }

      // A VIEWER attempting workspace.archive on an archived workspace still gets 403 (not 409)
      mockWorkspaceFindFirst.mockResolvedValue({
        id: wsId,
        ownerId: userA.userId,
        projectId: null,
        archivedAt: archivedDate,
        members: [{ role: "VIEWER" }],
      });
      await expect(
        requireWorkspace(userB, wsId, "workspace.archive")
      ).rejects.toMatchObject({
        status: 403,
        code: "forbidden",
      });

      // Archived project follows the same rule
      mockProjectFindFirst.mockResolvedValue({
        id: projId,
        ownerId: userA.userId,
        archivedAt: archivedDate,
        members: [{ role: "ADMIN" }],
      });
      expect((await resolveProjectRole(userB.userId, projId))?.role).toBe("ADMIN");
      await expect(
        requireProject(userB, projId, "workspace.read")
      ).resolves.toMatchObject({ role: "ADMIN" });
      await expect(
        requireProject(userB, projId, "workspace.rename")
      ).rejects.toMatchObject({
        status: 409,
        code: "conflict",
        message: "Project is archived",
      });
    });
  });
});
