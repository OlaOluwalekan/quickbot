export const QUESTION_BATCH_PROMPT_VERSION = "2026-11-1";

export interface QuestionBatchItem {
  id: string;
  passage: string;
  question: string;
}

export interface TargetQuestionsGroup {
  targetKey: string;
  targetType: "RESPONSE_VERSION" | "ANNOTATION_MESSAGE" | "DOCUMENT_REVISION";
  sourceDescription?: string;
  containingText: string;
  questions: QuestionBatchItem[];
}

export function buildQuestionBatchPrompt(
  groups: TargetQuestionsGroup[]
): string {
  let prompt = `You are an AI assistant answering a batch of questions that the user asked about highlighted passages from earlier text.\n\n`;

  prompt += `Here are the context targets and the specific questions asked for each:\n\n`;

  for (const group of groups) {
    prompt += `=== CONTEXT ===\n`;
    prompt += `Source: ${group.sourceDescription || "An earlier text"}\n\n`;
    prompt += `Containing Text:\n«««\n${group.containingText}\n»»»\n\n`;
    prompt += `Questions on this context:\n`;
    for (const q of group.questions) {
      prompt += `- [Question ID: ${q.id}]\n`;
      prompt += `  Highlighted Passage: «${q.passage}»\n`;
      prompt += `  Question: ${q.question}\n\n`;
    }
  }

  prompt += `Instructions:
1. Answer each question clearly and concisely based on its highlighted passage and context.
2. Return a valid JSON array of objects with exactly two properties: "id" (the Question ID) and "answer" (your concise response).
3. Do not include markdown code block wrapper or any surrounding text. Return ONLY the raw JSON array.
4. Output format:
[
  { "id": "<question_id>", "answer": "<concise answer>" }
]`;

  return prompt;
}

export const questionBatchResponseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      answer: { type: "string" },
    },
    required: ["id", "answer"],
  },
};
