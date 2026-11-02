import { z } from "zod";

export const pageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PageQuery = z.infer<typeof pageQuery>;

export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items.at(-1);
  return {
    items,
    nextCursor: hasMore && lastItem ? lastItem.id : null,
  };
}
// query: findMany({ take: limit + 1, ...(cursor && { cursor: { id: cursor }, skip: 1 }), orderBy: [...] })
