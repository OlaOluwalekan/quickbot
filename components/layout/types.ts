export interface AppShellUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  planName: string;
  creditBalance: number;
}

export interface SidebarProjectItem {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
}

export interface SidebarWorkspaceItem {
  id: string;
  title: string;
  ownerId: string;
  projectId: string | null;
  projectName?: string | null;
  updatedAt: string;
}
