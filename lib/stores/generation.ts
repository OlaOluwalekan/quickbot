import { create } from "zustand";

export type StreamStatus =
  | "idle"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkspaceGenerationStream {
  status: StreamStatus;
  text: string;
  thought: string;
  progressLabel: string | null;
  generationId: string | null;
  prompt: string;
  error: string | null;
}

export const DEFAULT_WORKSPACE_STREAM: WorkspaceGenerationStream = {
  status: "idle",
  text: "",
  thought: "",
  progressLabel: null,
  generationId: null,
  prompt: "",
  error: null,
};

export const DRAFT_STREAM_KEY = "__new__";

export interface GenerationStoreState {
  streams: Record<string, WorkspaceGenerationStream>;
  startStream: (
    workspaceId: string,
    init?: { prompt?: string; generationId?: string | null }
  ) => void;
  appendDelta: (workspaceId: string, delta: string) => void;
  appendThought: (workspaceId: string, delta: string) => void;
  setProgress: (workspaceId: string, label: string | null) => void;
  setGenerationId: (workspaceId: string, generationId: string) => void;
  completeStream: (workspaceId: string, finalText?: string) => void;
  failStream: (workspaceId: string, error: string) => void;
  cancelStream: (workspaceId: string) => void;
  resetStream: (workspaceId: string) => void;
  clearAllStreams: () => void;
  getStream: (workspaceId?: string | null) => WorkspaceGenerationStream;
}

export const useGenerationStore = create<GenerationStoreState>((set, get) => ({
  streams: {},

  startStream: (workspaceId, init) =>
    set((state) => ({
      streams: {
        ...state.streams,
        [workspaceId]: {
          ...DEFAULT_WORKSPACE_STREAM,
          status: "streaming",
          prompt: init?.prompt ?? "",
          generationId: init?.generationId ?? null,
        },
      },
    })),

  appendDelta: (workspaceId, delta) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            status: "streaming",
            text: current.text + delta,
          },
        },
      };
    }),

  appendThought: (workspaceId, delta) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            thought: current.thought + delta,
          },
        },
      };
    }),

  setProgress: (workspaceId, label) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            progressLabel: label,
          },
        },
      };
    }),

  setGenerationId: (workspaceId, generationId) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            generationId,
          },
        },
      };
    }),

  completeStream: (workspaceId, finalText) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            status: "completed",
            text: finalText !== undefined ? finalText : current.text,
            progressLabel: null,
          },
        },
      };
    }),

  failStream: (workspaceId, error) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            status: "failed",
            error,
            progressLabel: null,
          },
        },
      };
    }),

  cancelStream: (workspaceId) =>
    set((state) => {
      const current = state.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM;
      return {
        streams: {
          ...state.streams,
          [workspaceId]: {
            ...current,
            status: "cancelled",
            progressLabel: null,
          },
        },
      };
    }),

  resetStream: (workspaceId) =>
    set((state) => {
      const next = { ...state.streams };
      delete next[workspaceId];
      return { streams: next };
    }),

  clearAllStreams: () => set({ streams: {} }),

  getStream: (workspaceId) => {
    const key = workspaceId || DRAFT_STREAM_KEY;
    return get().streams[key] ?? DEFAULT_WORKSPACE_STREAM;
  },
}));
