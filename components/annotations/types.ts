/** Shapes of the annotation rows returned by the annotations endpoints. */

export interface AnnotationAuthor {
  id: string;
  name?: string | null;
  email?: string;
  image?: string | null;
}

export interface AnnotationMessageItem {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  generationId?: string | null;
  createdAt: string | Date;
  author?: AnnotationAuthor | null;
  mentions?: Array<{ isKlecx?: boolean; userId?: string | null }>;
}

export interface AnnotationItem {
  id: string;
  workspaceId: string;
  responseId?: string | null;
  versionId?: string | null;
  targetType?: "RESPONSE_VERSION" | "ANNOTATION_MESSAGE" | "DOCUMENT_REVISION";
  targetMessageId?: string | null;
  depth?: number;
  authorType?: "USER" | "AI";
  suggestion?: {
    exact?: string;
    prefix?: string;
    suffix?: string;
    replacement?: string;
    category?: string;
    severity?: string;
  } | null;
  suggestionState?: "PENDING" | "ACCEPTED" | "REJECTED" | "STALE" | null;
  kind: "COMMENT" | "ASK";
  questionState?: "NONE" | "QUEUED" | "ANSWERING" | "ANSWERED" | "FAILED" | "CANCELLED";
  visibility: "PRIVATE" | "WORKSPACE";
  resolvedAt?: string | Date | null;
  detachedAt?: string | Date | null;
  anchorExact: string;
  anchorPrefix?: string;
  anchorSuffix?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  createdBy: AnnotationAuthor;
  messages: AnnotationMessageItem[];
  note?: { id: string; status?: string } | null;
  notes?: Array<{ id: string; status?: string }>;
}
