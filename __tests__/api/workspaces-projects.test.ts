/**
 * @jest-environment node
 */
const mockGetActor = jest.fn();

jest.mock("../../server/auth/session", () => ({
  getActor: (...args: unknown[]) => mockGetActor(...args),
}));

jest.mock("../../server/auth/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

const mockWorkspaceFindMany = jest.fn();
const mockWorkspaceFindFirst = jest.fn();
const mockWorkspaceFindUnique = jest.fn();
const mockWorkspaceCreate = jest.fn();
const mockWorkspaceUpdate = jest.fn();

const mockProjectFindMany = jest.fn();
const mockProjectFindFirst = jest.fn();
const mockProjectFindUnique = jest.fn();
const mockProjectCreate = jest.fn();
const mockProjectUpdate = jest.fn();

const mockProjectMemberFindUnique = jest.fn();
const mockResponseFindMany = jest.fn();

jest.mock("../../server/db/client", () => ({
  db: {
    workspace: {
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
      findFirst: (...args: unknown[]) => mockWorkspaceFindFirst(...args),
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      create: (...args: unknown[]) => mockWorkspaceCreate(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      create: (...args: unknown[]) => mockProjectCreate(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
    },
    projectMember: {
      findUnique: (...args: unknown[]) => mockProjectMemberFindUnique(...args),
    },
    response: {
      findMany: (...args: unknown[]) => mockResponseFindMany(...args),
    },
  },
}));

import { NextRequest } from "next/server";
import type { Actor } from "@/server/auth/session";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  restoreWorkspace,
  searchWorkspaces,
  updateWorkspace,
} from "@/server/services/workspace";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectWorkspaces,
  listProjects,
  updateProject,
} from "@/server/services/project";
import { GET as getWorkspacesRoute, POST as postWorkspacesRoute } from "@/app/api/v1/workspaces/route";
import {
  GET as getWorkspaceByIdRoute,
  PATCH as patchWorkspaceByIdRoute,
  DELETE as deleteWorkspaceByIdRoute,
} from "@/app/api/v1/workspaces/[id]/route";
import { POST as restoreWorkspaceRoute } from "@/app/api/v1/workspaces/[id]/restore/route";
import { GET as searchWorkspacesRoute } from "@/app/api/v1/workspaces/search/route";
import { GET as getProjectsRoute, POST as postProjectsRoute } from "@/app/api/v1/projects/route";
import {
  GET as getProjectByIdRoute,
  PATCH as patchProjectByIdRoute,
  DELETE as deleteProjectByIdRoute,
} from "@/app/api/v1/projects/[id]/route";
import { GET as getProjectWorkspacesRoute } from "@/app/api/v1/projects/[id]/workspaces/route";
import { POST as postChatStreamRoute } from "@/app/api/chat/stream/route";
import { POST as postChatImageRoute } from "@/app/api/chat/image/route";

describe("Workspaces and Projects API & Service Tests (Step 1.6)", () => {
  const alice: Actor = {
    userId: "01966f0c-7c2a-7000-8000-00000000000a",
    role: "USER",
    sessionId: "sess_a",
    email: "alice@example.com",
    name: "Alice",
  };

  const bob: Actor = {
    userId: "01966f0c-7c2a-7000-8000-00000000000b",
    role: "USER",
    sessionId: "sess_b",
    email: "bob@example.com",
    name: "Bob",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActor.mockResolvedValue(alice);
  });

  describe("Workspace Service", () => {
    it("creates a standalone workspace with default title 'New workspace' when title is omitted", async () => {
      mockWorkspaceCreate.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        title: "New workspace",
        titleSource: "AUTO",
      });

      const ws = await createWorkspace(alice, {});
      expect(ws.title).toBe("New workspace");
      expect(ws.titleSource).toBe("AUTO");
      expect(mockWorkspaceCreate).toHaveBeenCalledWith({
        data: {
          ownerId: alice.userId,
          projectId: null,
          title: "New workspace",
          titleSource: "AUTO",
        },
      });
    });

    it("creates a workspace inside a project if user is project OWNER/EDITOR", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceCreate.mockResolvedValue({
        id: "ws_02",
        ownerId: alice.userId,
        projectId: "proj_01",
        title: "Project Alpha Workspace",
        titleSource: "USER",
      });

      const ws = await createWorkspace(alice, {
        title: "Project Alpha Workspace",
        projectId: "proj_01",
      });
      expect(ws.projectId).toBe("proj_01");
      expect(ws.title).toBe("Project Alpha Workspace");
    });

    it("rejects workspace creation in project if user is only a VIEWER", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        ownerId: alice.userId,
        deletedAt: null,
        members: [{ role: "VIEWER" }],
      });

      await expect(
        createWorkspace(bob, {
          title: "Bob Workspace",
          projectId: "proj_01",
        })
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it("returns 404 (never 403) when user creates workspace in inaccessible project", async () => {
      mockProjectFindFirst.mockResolvedValue(null);

      await expect(
        createWorkspace(bob, {
          title: "Bob Workspace",
          projectId: "proj_private",
        })
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it("lists workspaces with pagination and filters", async () => {
      const mockRows = [
        {
          id: "ws_02",
          title: "Second Workspace",
          ownerId: alice.userId,
          projectId: null,
          deletedAt: null,
          project: null,
          _count: { members: 1 },
        },
        {
          id: "ws_01",
          title: "First Workspace",
          ownerId: alice.userId,
          projectId: null,
          deletedAt: null,
          project: null,
          _count: { members: 1 },
        },
      ];
      mockWorkspaceFindMany.mockResolvedValue(mockRows);

      const page = await listWorkspaces(alice, { limit: 20 });
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
      expect(mockWorkspaceFindMany).toHaveBeenCalled();
    });

    it("gets workspace detail and returns role", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        title: "Alice Workspace",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
        project: null,
        _count: { members: 1 },
      });

      const res = await getWorkspace(alice, "ws_01");
      expect(res.id).toBe("ws_01");
      expect(res.role).toBe("OWNER");
    });

    it("returns 404 (never 403) when non-member tries to get workspace", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);

      await expect(getWorkspace(bob, "ws_alice")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("returns 404 when trying to get a soft-deleted workspace", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);

      await expect(getWorkspace(alice, "ws_deleted")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("updates workspace title and titleSource to USER", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        title: "Renamed Title",
        titleSource: "USER",
      });

      const updated = await updateWorkspace(alice, "ws_01", {
        title: "Renamed Title",
      });
      expect(updated.title).toBe("Renamed Title");
    });

    it("authorizes PATCH before input processing: rejects empty update with 422 validation error", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
      });

      await expect(updateWorkspace(alice, "ws_01", {})).rejects.toMatchObject({
        status: 422,
        code: "validation_error",
      });
    });

    it("authorizes PATCH before input processing: returns 404 for non-members even with empty input", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);

      await expect(updateWorkspace(bob, "ws_alice", {})).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("authorizes PATCH before input processing: returns 404 for soft-deleted workspaces", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);

      await expect(updateWorkspace(alice, "ws_deleted", { title: "New" })).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("soft-deletes workspace by setting deletedAt", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        deletedAt: new Date(),
      });

      const res = await deleteWorkspace(alice, "ws_01");
      expect(res.deletedAt).toBeDefined();
    });

    it("restores soft-deleted workspace within 30-day window", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockWorkspaceFindUnique.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: tenDaysAgo,
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        deletedAt: null,
      });

      const res = await restoreWorkspace(alice, "ws_01");
      expect(res.deletedAt).toBeNull();
    });

    it("rejects restore of workspace deleted more than 30 days ago with 409 Conflict", async () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      mockWorkspaceFindUnique.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: fortyDaysAgo,
      });

      await expect(restoreWorkspace(alice, "ws_01")).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe("Project Service", () => {
    it("creates project with actor as owner", async () => {
      mockProjectCreate.mockResolvedValue({
        id: "proj_01",
        ownerId: alice.userId,
        name: "Acme Platform",
        description: "Primary client project",
      });

      const proj = await createProject(alice, {
        name: "Acme Platform",
        description: "Primary client project",
      });
      expect(proj.name).toBe("Acme Platform");
      expect(proj.ownerId).toBe(alice.userId);
    });

    it("lists projects for user", async () => {
      mockProjectFindMany.mockResolvedValue([
        {
          id: "proj_01",
          name: "Acme Platform",
          ownerId: alice.userId,
          deletedAt: null,
          _count: { workspaces: 3, members: 2 },
        },
      ]);

      const page = await listProjects(alice, { limit: 20 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.name).toBe("Acme Platform");
      expect(page.nextCursor).toBeNull();
    });

    it("gets project detail with member role", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme Platform",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
        _count: { workspaces: 3, members: 2 },
      });

      const proj = await getProject(alice, "proj_01");
      expect(proj.id).toBe("proj_01");
      expect(proj.role).toBe("OWNER");
    });

    it("returns 404 (never 403) when non-member tries to get project", async () => {
      mockProjectFindFirst.mockResolvedValue(null);

      await expect(getProject(bob, "proj_alice")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("updates project name and description", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme Platform",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockProjectUpdate.mockResolvedValue({
        id: "proj_01",
        name: "Acme Core Platform",
        description: "Updated desc",
      });

      const updated = await updateProject(alice, "proj_01", {
        name: "Acme Core Platform",
        description: "Updated desc",
      });
      expect(updated.name).toBe("Acme Core Platform");
    });

    it("authorizes PATCH before input processing: rejects empty update with 422 validation error", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme Platform",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });

      await expect(updateProject(alice, "proj_01", {})).rejects.toMatchObject({
        status: 422,
        code: "validation_error",
      });
    });

    it("authorizes PATCH before input processing: returns 404 for non-members even with empty input", async () => {
      mockProjectFindFirst.mockResolvedValue(null);

      await expect(updateProject(bob, "proj_alice", {})).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("soft-deletes project", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme Platform",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockProjectUpdate.mockResolvedValue({
        id: "proj_01",
        deletedAt: new Date(),
      });

      const deleted = await deleteProject(alice, "proj_01");
      expect(deleted.deletedAt).toBeDefined();
    });

    it("lists workspaces in a project", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme Platform",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceFindMany.mockResolvedValue([
        {
          id: "ws_proj_01",
          projectId: "proj_01",
          title: "Feature A",
          deletedAt: null,
        },
      ]);

      const page = await getProjectWorkspaces(alice, "proj_01", { limit: 20 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.title).toBe("Feature A");
      expect(page.nextCursor).toBeNull();
    });
  });

  describe("Scoped Conversation Search (Defect 3)", () => {
    it("searches strictly within 'this chat' when requested and enforces workspace read access", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });

      const mockResponses = [
        {
          id: "resp_01",
          chatId: "ws_01",
          question: "How does pagination work?",
          response: "Cursor pagination works using ID and limit.",
        },
      ];
      mockResponseFindMany.mockResolvedValue(mockResponses);

      const res = await searchWorkspaces(alice, {
        q: "pagination",
        scope: "this chat",
        workspaceId: "ws_01",
      });

      expect(res.results).toEqual(mockResponses);
      expect(mockResponseFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chatId: "ws_01",
          }),
        })
      );
    });

    it("rejects 'this chat' search with 404 for non-members (privacy rule)", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);

      await expect(
        searchWorkspaces(bob, {
          q: "pagination",
          scope: "this chat",
          workspaceId: "ws_alice",
        })
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it("searches across 'all chats' for matching titles and responses", async () => {
      mockWorkspaceFindMany.mockResolvedValue([
        { id: "ws_01", title: "Pagination Workspace" },
      ]);
      mockResponseFindMany.mockResolvedValue([
        { id: "resp_02", chatId: "ws_02", response: "See pagination guide" },
      ]);

      const res = await searchWorkspaces(alice, {
        q: "pagination",
        scope: "all chats",
      });

      expect(res.results).toHaveLength(2);
    });

    it("GET /api/v1/workspaces/search route returns 200 with search results envelope", async () => {
      mockWorkspaceFindMany.mockResolvedValue([]);
      mockResponseFindMany.mockResolvedValue([]);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/workspaces/search?q=test&scope=all+chats"
      );
      const res = await searchWorkspacesRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ results: [] });
    });
  });

  describe("AI Endpoints Generation Permission (Defect 2)", () => {
    it("POST /api/chat/stream rejects VIEWER role with 403 Forbidden", async () => {
      // Bob is VIEWER on ws_01
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: null,
        members: [{ role: "VIEWER" }],
      });
      mockGetActor.mockResolvedValue(bob);

      const req = new NextRequest("http://localhost:3000/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Hello AI", chatId: "ws_01" }),
      });

      const res = await postChatStreamRoute(req);
      expect(res.status).toBe(403);
    });

    it("POST /api/chat/stream rejects archived workspace with 409 Conflict", async () => {
      // Alice is OWNER but workspace is archived
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        archivedAt: new Date(),
        deletedAt: null,
        members: [],
      });
      mockGetActor.mockResolvedValue(alice);

      const req = new NextRequest("http://localhost:3000/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Hello AI", chatId: "ws_01" }),
      });

      const res = await postChatStreamRoute(req);
      expect(res.status).toBe(409);
    });

    it("POST /api/chat/stream rejects non-member with 404 Not Found", async () => {
      mockWorkspaceFindFirst.mockResolvedValue(null);
      mockGetActor.mockResolvedValue(bob);

      const req = new NextRequest("http://localhost:3000/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Hello AI", chatId: "ws_alice" }),
      });

      const res = await postChatStreamRoute(req);
      expect(res.status).toBe(404);
    });

    it("POST /api/chat/image rejects VIEWER role with 403 Forbidden", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: null,
        members: [{ role: "VIEWER" }],
      });
      mockGetActor.mockResolvedValue(bob);

      const req = new NextRequest("http://localhost:3000/api/chat/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "A blue ocean", chatId: "ws_01" }),
      });

      const res = await postChatImageRoute(req);
      expect(res.status).toBe(403);
    });

    it("POST /api/chat/image rejects archived workspace with 409 Conflict", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        archivedAt: new Date(),
        deletedAt: null,
        members: [],
      });
      mockGetActor.mockResolvedValue(alice);

      const req = new NextRequest("http://localhost:3000/api/chat/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "A blue ocean", chatId: "ws_01" }),
      });

      const res = await postChatImageRoute(req);
      expect(res.status).toBe(409);
    });
  });

  describe("API Route Handlers", () => {
    it("GET /api/v1/workspaces returns 200 with list data envelope", async () => {
      mockWorkspaceFindMany.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces?limit=10");
      const res = await getWorkspacesRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ items: [], nextCursor: null });
    });

    it("POST /api/v1/workspaces validates input schema and returns 200 on success", async () => {
      mockWorkspaceCreate.mockResolvedValue({
        id: "ws_new_01",
        ownerId: alice.userId,
        projectId: null,
        title: "Test Workspace",
        titleSource: "USER",
      });

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Test Workspace" }),
      });

      const res = await postWorkspacesRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe("Test Workspace");
    });

    it("GET /api/v1/workspaces/:id returns 200 and workspace detail", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        title: "Alice Workspace",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
        project: null,
        _count: { members: 1 },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces/ws_01");
      const res = await getWorkspaceByIdRoute(req, { params: Promise.resolve({ id: "ws_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe("ws_01");
    });

    it("PATCH /api/v1/workspaces/:id updates workspace", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        title: "Updated Title",
        titleSource: "USER",
      });

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces/ws_01", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      });
      const res = await patchWorkspaceByIdRoute(req, { params: Promise.resolve({ id: "ws_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe("Updated Title");
    });

    it("DELETE /api/v1/workspaces/:id soft deletes workspace", async () => {
      mockWorkspaceFindFirst.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        projectId: null,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        deletedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces/ws_01", {
        method: "DELETE",
      });
      const res = await deleteWorkspaceByIdRoute(req, { params: Promise.resolve({ id: "ws_01" }) });
      expect(res.status).toBe(200);
    });

    it("POST /api/v1/workspaces/:id/restore restores soft-deleted workspace", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockWorkspaceFindUnique.mockResolvedValue({
        id: "ws_01",
        ownerId: alice.userId,
        deletedAt: tenDaysAgo,
      });
      mockWorkspaceUpdate.mockResolvedValue({
        id: "ws_01",
        deletedAt: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/workspaces/ws_01/restore", {
        method: "POST",
      });
      const res = await restoreWorkspaceRoute(req, { params: Promise.resolve({ id: "ws_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.deletedAt).toBeNull();
    });

    it("GET /api/v1/projects returns 200 with list data envelope", async () => {
      mockProjectFindMany.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/v1/projects?limit=10");
      const res = await getProjectsRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ items: [], nextCursor: null });
    });

    it("POST /api/v1/projects creates a project and returns 200", async () => {
      mockProjectCreate.mockResolvedValue({
        id: "proj_01",
        ownerId: alice.userId,
        name: "Acme",
        description: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme" }),
      });
      const res = await postProjectsRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe("Acme");
    });

    it("GET /api/v1/projects/:id returns 200 and project detail", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
        _count: { workspaces: 0, members: 1 },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/projects/proj_01");
      const res = await getProjectByIdRoute(req, { params: Promise.resolve({ id: "proj_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe("proj_01");
    });

    it("PATCH /api/v1/projects/:id updates project", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockProjectUpdate.mockResolvedValue({
        id: "proj_01",
        name: "Acme Global",
        description: null,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/projects/proj_01", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Acme Global" }),
      });
      const res = await patchProjectByIdRoute(req, { params: Promise.resolve({ id: "proj_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.name).toBe("Acme Global");
    });

    it("DELETE /api/v1/projects/:id soft deletes project", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockProjectUpdate.mockResolvedValue({
        id: "proj_01",
        deletedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/v1/projects/proj_01", {
        method: "DELETE",
      });
      const res = await deleteProjectByIdRoute(req, { params: Promise.resolve({ id: "proj_01" }) });
      expect(res.status).toBe(200);
    });

    it("GET /api/v1/projects/:id/workspaces returns 200 with list data envelope", async () => {
      mockProjectFindFirst.mockResolvedValue({
        id: "proj_01",
        name: "Acme",
        ownerId: alice.userId,
        deletedAt: null,
        members: [],
      });
      mockWorkspaceFindMany.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/v1/projects/proj_01/workspaces");
      const res = await getProjectWorkspacesRoute(req, { params: Promise.resolve({ id: "proj_01" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ items: [], nextCursor: null });
    });
  });
});
