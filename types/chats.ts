export interface ChatProps {
  id: string;
  title: string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type ResponseType = "TEXT" | "IMAGE";

export interface ResponseProps {
  id: string;
  chatId: string;
  question: string;
  response: string;
  type?: ResponseType;
  imageUrl?: string | null;
  mimeType?: string | null;
  interactionId?: string | null;
  createdAt: Date | string;
}

