export const MAX_ANNOTATION_DEPTH = 100;

/**
 * Longest an API route may run, in seconds. The limit itself is set in
 * `vercel.json` (the `maxDuration` of the API routes): keep the two equal.
 */
export const MAX_FUNCTION_SECONDS = 300;

/**
 * An Ask answer still marked STREAMING after this long was interrupted (the
 * route that wrote it has been stopped), so it can be answered again. Longer
 * than the route's limit, so a slow answer is never taken for a dead one.
 */
export const ANSWER_STALE_MS = (MAX_FUNCTION_SECONDS + 60) * 1000;
