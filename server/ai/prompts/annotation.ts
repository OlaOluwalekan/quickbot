export const ANNOTATION_PROMPT_VERSION = "2026-10-1";

export interface AnnotationReplyContext {
  highlightedText: string;
  userComment: string;
  sourceType?: "ORIGINAL" | `EDIT:${number}`;
}

export function buildAnnotationReplyPrompt(ctx: AnnotationReplyContext): string {
  return `The user has highlighted the following text from the workspace:\n"${ctx.highlightedText}"\n\nUser question/comment:\n${ctx.userComment}`;
}

export function buildBatchQuestionsPrompt(questions: string[]): string {
  const formatted = questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n");
  return `Please answer the following batch questions based on the workspace content:\n\n${formatted}`;
}
