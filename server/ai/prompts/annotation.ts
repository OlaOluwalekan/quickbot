export const ANNOTATION_PROMPT_VERSION = "2026-10-1";

export interface AnnotationReplyContext {
  highlightedText?: string;
  exact?: string;
  userComment?: string;
  prompt?: string;
  versionText?: string;
  originalPrompt?: string;
  sourceType?: "ORIGINAL" | `EDIT:${number}`;
}

export function buildAnnotationReplyPrompt(ctx: AnnotationReplyContext): string {
  const exact = ctx.exact || ctx.highlightedText || "";
  const userPrompt = ctx.prompt || ctx.userComment || "";

  if (ctx.versionText && ctx.originalPrompt) {
    return `The user highlighted this passage from your earlier answer: «${exact}».

Here is the full answer for context:
${ctx.versionText}

Original request:
${ctx.originalPrompt}

Answer the user's follow-up about the passage; be concise; don't repeat the whole answer:
${userPrompt}`;
  }

  return `The user has highlighted the following text from the workspace:\n"${exact}"\n\nUser question/comment:\n${userPrompt}`;
}

export function buildBatchQuestionsPrompt(questions: string[]): string {
  const formatted = questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n");
  return `Please answer the following batch questions based on the workspace content:\n\n${formatted}`;
}
