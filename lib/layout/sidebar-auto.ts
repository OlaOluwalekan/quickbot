/**
 * Auto-closing sidebar (owner decision 2026-11-14). Pure rules, no React.
 *
 * - When the open columns don't fit next to the expanded sidebar at their
 *   minimum widths, the sidebar collapses to its rail by itself.
 * - Hovering the rail (or reaching it with the keyboard) opens the full
 *   sidebar as an overlay over the page.
 * - Only the toggle pins it open; the pin is remembered.
 * - When the columns close, the person's own choice (the `sidebar` cookie)
 *   applies again.
 */

/** Widths of the desktop sidebar (`w-70` / `w-16`). */
export const SIDEBAR_EXPANDED_PX = 280;
export const SIDEBAR_RAIL_PX = 64;

/** Columns that must fit at their minimum width beside the main conversation. */
export const AUTO_COLLAPSE_MAX_COLUMNS = 2;

/**
 * Whether the columns need the sidebar's room.
 *
 * @param widthWithExpandedSidebar width of the content area when the sidebar
 *   is expanded (measure the current width and add back what the rail saves).
 * @param openColumns number of Ask / document columns open.
 */
export function columnsNeedSidebarRoom(
  widthWithExpandedSidebar: number,
  openColumns: number,
  mins: { mainMin: number; colMin: number }
): boolean {
  if (openColumns <= 0 || widthWithExpandedSidebar <= 0) return false;
  const columns = Math.min(openColumns, AUTO_COLLAPSE_MAX_COLUMNS);
  return widthWithExpandedSidebar < mins.mainMin + columns * mins.colMin;
}

export interface SidebarState {
  /** The person's own choice (cookie): rail when true. */
  userCollapsed: boolean;
  /** Open columns don't fit beside the expanded sidebar. */
  columnsNeedRoom: boolean;
  /** The person pinned the sidebar open while columns were open (remembered). */
  pinnedOpen: boolean;
}

/** `auto` = collapsed by the app, not by the person (hover opens the overlay). */
export function resolveSidebar(s: SidebarState): { collapsed: boolean; auto: boolean } {
  const auto = !s.userCollapsed && s.columnsNeedRoom && !s.pinnedOpen;
  return { collapsed: s.userCollapsed || auto, auto };
}

/** What the toggle button (and `[`) does. */
export function toggleSidebar(s: SidebarState): { userCollapsed: boolean; pinnedOpen: boolean } {
  const { collapsed, auto } = resolveSidebar(s);
  if (auto) return { userCollapsed: false, pinnedOpen: true }; // pin it open
  if (collapsed) return { userCollapsed: false, pinnedOpen: s.pinnedOpen };
  return { userCollapsed: true, pinnedOpen: false }; // collapsing also unpins
}
