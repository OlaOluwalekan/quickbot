export interface ChatProps {
  id: string;
  title: string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ResponseProps {
  id: string;
  chatId: string;
  question: string;
  response: string;
  createdAt: Date | string;
}
