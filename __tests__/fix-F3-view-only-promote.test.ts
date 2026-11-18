/**
 * @jest-environment node
 *
 * F3.x — "New workspace" from an Ask lists every project the person belongs
 * to; the list carries their rights per project, so view-only ones can be
 * greyed out. The server still refuses them.
 */
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { listProjects } from "@/server/services/project";
import { resolveProjectRole } from "@/server/authz/access";
import { createInProjectGateReason } from "@/lib/entitlements/shared";
import { GET as listProjectsRoute } from "@/app/api/v1/projects/route";

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

const sfx = Date.now().toString().slice(-7);
const ids = {
  owner: `f3v_own_${sfx}`,
  viewer: `f3v_view_${sfx}`,
  editor: `f3v_edit_${sfx}`,
  suspended: `f3v_susp_${sfx}`,
  stranger: `f3v_str_${sfx}`,
};
const allIds = Object.values(ids);
const actorFor = (k: keyof typeof ids): Actor => ({
  userId: ids[k],
  role: "USER",
  sessionId: `sess_${k}_${sfx}`,
  email: `${k}_${sfx}@example.com`,
  name: k,
});

let projectId = "";

async function cleanup() {
  await db.projectMember.deleteMany({ where: { userId: { in: allIds } } });
  await db.project.deleteMany({ where: { ownerId: { in: allIds } } });
  await db.user.deleteMany({ where: { id: { in: allIds } } });
}

beforeAll(async () => {
  await cleanup();
  await db.user.createMany({
    data: (Object.keys(ids) as Array<keyof typeof ids>).map((k) => ({
      id: ids[k],
      email: `${k}_${sfx}@example.com`,
      name: k,
      emailVerified: true,
      username: `${k}${sfx}`.toLowerCase(),
      displayUsername: `${k}${sfx}`.toLowerCase(),
    })),
  });
  const project = await db.project.create({ data: { name: "Shared project", ownerId: ids.owner } });
  projectId = project.id;
  await db.projectMember.createMany({
    data: [
      { projectId, userId: ids.viewer, role: "VIEWER", invitedById: ids.owner },
      { projectId, userId: ids.editor, role: "EDITOR", invitedById: ids.owner },
      { projectId, userId: ids.suspended, role: "EDITOR", suspendedAt: new Date(), invitedById: ids.owner },
    ],
  });
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function rowFor(k: keyof typeof ids) {
  const page = await listProjects(actorFor(k), { limit: 50 });
  return page.items.find((p) => p.id === projectId);
}

describe("F3.x — rights per project in the projects list", () => {
  it("the owner and an editor can create workspaces in it", async () => {
    for (const k of ["owner", "editor"] as const) {
      const row = await rowFor(k);
      expect(row?.capabilities).toContain("workspace.generate");
      expect(createInProjectGateReason(row?.capabilities)).toBeNull();
    }
    expect((await rowFor("owner"))?.role).toBe("OWNER");
  });

  it("a viewer and a suspended editor see it, greyed out as view-only", async () => {
    for (const k of ["viewer", "suspended"] as const) {
      const row = await rowFor(k);
      expect(row).toBeDefined();
      expect(row?.role).toBe("VIEWER");
      expect(row?.capabilities).not.toContain("workspace.generate");
      expect(createInProjectGateReason(row?.capabilities)).toEqual({ code: "view_only_project" });
    }
  });

  it("the list's rights match the access check used on writes", async () => {
    for (const k of ["owner", "viewer", "editor", "suspended"] as const) {
      const row = await rowFor(k);
      const access = await resolveProjectRole(ids[k], projectId);
      expect(new Set(row?.capabilities)).toEqual(access?.capabilities);
      expect(row?.role).toBe(access?.role);
    }
  });

  it("rows don't leak other members' memberships", async () => {
    const row = (await rowFor("owner")) as Record<string, unknown> | undefined;
    expect(row).not.toHaveProperty("members");
  });

  it("someone outside the project doesn't get it (route, unauthorized access)", async () => {
    mockActor = actorFor("stranger");
    const res = await listProjectsRoute(
      new NextRequest("http://localhost:3000/api/v1/projects?limit=50"),
      { params: Promise.resolve({}) } as never
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items.map((p: { id: string }) => p.id)).not.toContain(projectId);

    mockActor = null;
    const anon = await listProjectsRoute(
      new NextRequest("http://localhost:3000/api/v1/projects"),
      { params: Promise.resolve({}) } as never
    );
    expect(anon.status).toBe(401);
  });

  it("the route returns role and capabilities for each row", async () => {
    mockActor = actorFor("viewer");
    const res = await listProjectsRoute(
      new NextRequest("http://localhost:3000/api/v1/projects?limit=50"),
      { params: Promise.resolve({}) } as never
    );
    const json = await res.json();
    const row = json.data.items.find((p: { id: string }) => p.id === projectId);
    expect(row.role).toBe("VIEWER");
    expect(row.capabilities).toContain("workspace.read");
    expect(row.capabilities).not.toContain("workspace.generate");
  });
});
