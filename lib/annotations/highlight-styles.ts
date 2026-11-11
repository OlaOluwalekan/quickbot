import { HIGHLIGHT_NAME_MAP } from "./highlight";

/**
 * CSS for the annotation highlights (CSS Custom Highlight API).
 *
 * These rules are rendered in a <style> tag by the root layout instead of
 * living in globals.css: the CSS optimizer used by the build does not know
 * the `::highlight()` pseudo-element yet and prints a warning for each rule.
 */
export const HIGHLIGHT_CSS = [
  `::highlight(${HIGHLIGHT_NAME_MAP.COMMENT}){background-color:var(--mark-comment)}`,
  `::highlight(${HIGHLIGHT_NAME_MAP.ASK}){background-color:var(--mark-reply)}`,
  `::highlight(annot-hover){text-decoration:underline 2px solid var(--accent)}`,
].join("\n");
