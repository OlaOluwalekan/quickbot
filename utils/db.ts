import "server-only";
import { db as v2Db } from "@/server/db/client";
import type { ResponseProps } from "@/types/chats";

export interface LegacyChatRecord {
  id: string;
  title: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Legacy compatibility export for v1 modules slated for replacement in Steps 1.3–2.x.
// All v2 modules must import `{ db }` from `@/server/db/client`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: Record<string, any> & {
  chat: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<LegacyChatRecord>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: (args?: any) => Promise<LegacyChatRecord[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<LegacyChatRecord | null>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<LegacyChatRecord>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: (args: any) => Promise<LegacyChatRecord>;
  };
  response: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: (args?: any) => Promise<ResponseProps[]>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<ResponseProps>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = v2Db as any;
