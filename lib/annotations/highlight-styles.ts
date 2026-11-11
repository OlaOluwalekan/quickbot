import { HIGHLIGHT_NAME_MAP } from "./highlight";

/**
 * CSS for the annotation highlights (CSS Custom Highlight API).
 *
 * These rules are rendered in a <style> tag by the root layout instead of
 * living in globals.css: the CSS optimizer used by the build does not know
 * the `::highlight()` pseudo-element yet and prints a warning for each rule.
 * All color tokens referenced here are defined for light & dark themes in app/globals.css.
 */
export const HIGHLIGHT_CSS = [
  `::highlight(${HIGHLIGHT_NAME_MAP.COMMENT}){text-decoration:underline dotted 1.5px var(--mark-comment);text-underline-offset:3px}`,
  `::highlight(${HIGHLIGHT_NAME_MAP.ASK}){background-color:var(--mark-ask,color-mix(in oklch,var(--accent) 12%,transparent))}`,
  `::highlight(${HIGHLIGHT_NAME_MAP.AI_REVIEW}){text-decoration:underline wavy 1px var(--warning);text-underline-offset:3px}`,
  `::highlight(annot-hover){background-color:var(--mark-hover,color-mix(in oklch,var(--accent) 18%,transparent))}`,
].join("\n");
