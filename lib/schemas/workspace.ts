import { z } from "zod";
import { pageQuery } from "@/server/http/pagination";

export const createWorkspaceSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  projectId: z.string().uuid().optional(),
});

export const updateWorkspaceSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  projectId: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

export const listWorkspacesQuerySchema = pageQuery.extend({
  projectId: z.string().uuid().optional(),
  standalone: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  q: z.string().trim().min(1).max(100).optional(),
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? false : v === "true")),
});

export const searchWorkspacesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  scope: z
    .enum(["this chat", "all chats", "this-chat", "all-chats"])
    .default("all chats"),
  workspaceId: z.string().optional(),
  chatId: z.string().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  archived: z.boolean().optional(),
});

export const listProjectsQuerySchema = pageQuery.extend({
  q: z.string().trim().min(1).max(100).optional(),
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? false : v === "true")),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type ListWorkspacesQuery = z.infer<typeof listWorkspacesQuerySchema>;
export type SearchWorkspacesQuery = z.infer<typeof searchWorkspacesQuerySchema>;

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
