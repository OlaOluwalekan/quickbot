import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, renderHook, act } from "@testing-library/react";
import {
  api,
  ApiClientError,
  navigationAdapter,
  onInsufficientCredits,
} from "@/lib/api/client";
import {
  userQueryKey,
  queryKeys,
  useUpdateWorkspace,
  type WorkspaceDto,
} from "@/lib/api/hooks";
import {
  QueryProvider,
  createAppQueryClient,
  clearAllClientCaches,
} from "@/components/providers/query-provider";
import { useUiStore, partializeUiState } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";

describe("Step 3.3 — Client Data Layer (api client, TanStack Query, Zustand)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    useUiStore.getState().clearAllDrafts();
    useUiStore.getState().resetTransientUi();
    useUiStore.setState({
      sidebarCollapsed: false,
      rightPanelOpen: false,
      composerEnterToSend: true,
    });
    useGenerationStore.getState().clearAllStreams();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("lib/api/client.ts", () => {
    it("unwraps { data } and sets JSON headers on object body", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { id: "ws-1", title: "Hello" } }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await api<{ id: string; title: string }>(
        "/api/v1/workspaces",
        {
          method: "POST",
          body: { title: "Hello" },
        },
      );

      expect(result).toEqual({ id: "ws-1", title: "Hello" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/workspaces");
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ title: "Hello" }));
      expect((init.headers as Headers).get("Content-Type")).toBe(
        "application/json",
      );
    });

    it("throws ApiClientError with status, code, message, details, and requestId", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        headers: new Headers({
          "content-type": "application/json",
          "x-request-id": "req-abc-123",
        }),
        json: async () => ({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid title",
            details: { field: "title" },
          },
        }),
      }) as unknown as typeof fetch;

      await expect(api("/api/v1/workspaces")).rejects.toMatchObject({
        name: "ApiClientError",
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Invalid title",
        details: { field: "title" },
        requestId: "req-abc-123",
      });
    });

    it("redirects to /login?next=... on 401", async () => {
      jest
        .spyOn(navigationAdapter, "currentPathWithSearch")
        .mockReturnValue("/workspaces/ws-42?tab=edits");
      const redirectSpy = jest
        .spyOn(navigationAdapter, "redirect")
        .mockImplementation(() => {});

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          error: { code: "UNAUTHORIZED", message: "Please sign in" },
        }),
      }) as unknown as typeof fetch;

      await expect(api("/api/v1/workspaces")).rejects.toBeInstanceOf(
        ApiClientError,
      );
      expect(redirectSpy).toHaveBeenCalledWith(
        "/login?next=%2Fworkspaces%2Fws-42%3Ftab%3Dedits",
      );
    });

    it("emits insufficient-credits event on 402", async () => {
      const listener = jest.fn();
      const unsubscribe = onInsufficientCredits(listener);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 402,
        statusText: "Payment Required",
        headers: new Headers({
          "content-type": "application/json",
          "x-request-id": "req-402",
        }),
        json: async () => ({
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: "Not enough credits",
            details: { required: 5, available: 1 },
          },
        }),
      }) as unknown as typeof fetch;

      await expect(api("/api/v1/generations")).rejects.toBeInstanceOf(
        ApiClientError,
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        status: 402,
        code: "INSUFFICIENT_CREDITS",
        message: "Not enough credits",
        details: { required: 5, available: 1 },
        requestId: "req-402",
      });

      unsubscribe();
    });
  });

  describe("Query-key convention & QueryProvider cache isolation", () => {
    it("enforces ['u', userId, ...] prefix on all query keys", () => {
      expect(userQueryKey("user-1", "workspaces")).toEqual([
        "u",
        "user-1",
        "workspaces",
      ]);
      expect(queryKeys.workspaces.detail("user-1", "ws-9")[0]).toBe("u");
      expect(queryKeys.workspaces.detail("user-1", "ws-9")[1]).toBe("user-1");
      expect(queryKeys.responses.all("user-1", "ws-9").slice(0, 2)).toEqual([
        "u",
        "user-1",
      ]);
      expect(queryKeys.projects.all("user-1").slice(0, 2)).toEqual([
        "u",
        "user-1",
      ]);
      expect(queryKeys.me.preferences("user-1").slice(0, 2)).toEqual([
        "u",
        "user-1",
      ]);
      expect(() => userQueryKey("", "workspaces")).toThrow();
    });

    it("clears QueryClient cache, drafts, and streams on account switch or sign-out", () => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(
        queryKeys.workspaces.detail("user-a", "ws-1"),
        { id: "ws-1", title: "User A Secret Workspace" },
      );
      useUiStore.getState().setDraft("ws-1", "secret draft");
      useGenerationStore
        .getState()
        .startStream("ws-1", { prompt: "secret prompt" });

      const { rerender } = render(
        <QueryProvider userId="user-a" client={queryClient}>
          <div>child</div>
        </QueryProvider>,
      );

      expect(
        queryClient.getQueryData(queryKeys.workspaces.detail("user-a", "ws-1")),
      ).toBeDefined();

      // Switch account from user-a to user-b
      rerender(
        <QueryProvider userId="user-b" client={queryClient}>
          <div>child</div>
        </QueryProvider>,
      );

      expect(
        queryClient.getQueryData(queryKeys.workspaces.detail("user-a", "ws-1")),
      ).toBeUndefined();
      expect(useUiStore.getState().drafts).toEqual({});
      expect(useGenerationStore.getState().streams).toEqual({});
    });

    it("clearAllClientCaches clears queryClient, drafts, and streams", () => {
      const queryClient = createAppQueryClient();
      queryClient.setQueryData(queryKeys.me.credits("user-a"), { tokens: 100 });
      useUiStore.getState().setDraft("ws-1", "hello");
      useGenerationStore.getState().startStream("ws-1", { prompt: "hello" });

      clearAllClientCaches(queryClient);

      expect(
        queryClient.getQueryData(queryKeys.me.credits("user-a")),
      ).toBeUndefined();
      expect(useUiStore.getState().drafts).toEqual({});
      expect(useGenerationStore.getState().streams).toEqual({});
    });
  });

  describe("Zustand stores: useUiStore & useGenerationStore", () => {
    it("persists only non-sensitive UI fields (sidebarCollapsed, rightPanelOpen, composerEnterToSend, drafts)", () => {
      act(() => {
        useUiStore.getState().setSidebarCollapsed(true);
        useUiStore.getState().setRightPanelOpen(true);
        useUiStore.getState().setComposerEnterToSend(false);
        useUiStore.getState().setDraft("ws-1", "my draft");
        useUiStore.getState().setCurrentPageTitle("Sensitive Title");
        useUiStore.getState().setDialogData({
          id: "ws-1",
          title: "Sensitive",
          createdBy: "u-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      const persisted = partializeUiState(useUiStore.getState());
      expect(persisted).toEqual({
        sidebarCollapsed: true,
        rightPanelOpen: true,
        composerEnterToSend: false,
        onboardingDismissed: false,
        drafts: { "ws-1": "my draft" },
      });
      expect("currentPageTitle" in persisted).toBe(false);
      expect("dialogData" in persisted).toBe(false);
      expect("optimisticResponses" in persisted).toBe(false);
    });

    it("tracks per-workspace streaming state in useGenerationStore", () => {
      const store = useGenerationStore.getState();
      store.startStream("ws-1", {
        prompt: "Explain quantum computing",
        generationId: "gen-1",
      });

      expect(useGenerationStore.getState().getStream("ws-1")).toMatchObject({
        status: "streaming",
        prompt: "Explain quantum computing",
        generationId: "gen-1",
        text: "",
        thought: "",
      });

      store.setProgress("ws-1", "Thinking...");
      store.appendThought("ws-1", "Step 1: qubits.");
      store.appendDelta("ws-1", "Quantum ");
      store.appendDelta("ws-1", "computing uses qubits.");

      expect(useGenerationStore.getState().getStream("ws-1")).toMatchObject({
        status: "streaming",
        progressLabel: "Thinking...",
        thought: "Step 1: qubits.",
        text: "Quantum computing uses qubits.",
      });

      store.completeStream("ws-1");
      expect(useGenerationStore.getState().getStream("ws-1").status).toBe(
        "completed",
      );
    });
  });

  describe("Optimistic mutations & Redux removal verification", () => {
    it("optimistically updates workspace title and rolls back on API failure", async () => {
      const queryClient = createAppQueryClient();
      const initialWorkspace: WorkspaceDto = {
        id: "ws-1",
        title: "Original Title",
        createdBy: "user-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData(
        queryKeys.workspaces.detail("user-1", "ws-1"),
        initialWorkspace,
      );

      let rejectFetch!: (reason?: unknown) => void;
      global.fetch = jest.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectFetch = reject;
          }),
      ) as unknown as typeof fetch;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryProvider userId="user-1" client={queryClient}>
          {children}
        </QueryProvider>
      );

      const { result } = renderHook(() => useUpdateWorkspace("user-1"), {
        wrapper,
      });

      let mutationPromise!: Promise<unknown>;
      act(() => {
        mutationPromise = result.current
          .mutateAsync({
            workspaceId: "ws-1",
            input: { title: "Optimistic Title" },
          })
          .catch(() => {});
      });

      // Verify optimistic update applied before network settles
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        queryClient.getQueryData<WorkspaceDto>(
          queryKeys.workspaces.detail("user-1", "ws-1"),
        )?.title,
      ).toBe("Optimistic Title");

      // Trigger failure and verify rollback to original title
      await act(async () => {
        rejectFetch(new Error("Network error"));
        await mutationPromise;
      });

      expect(
        queryClient.getQueryData<WorkspaceDto>(
          queryKeys.workspaces.detail("user-1", "ws-1"),
        )?.title,
      ).toBe("Original Title");
    });

    it("has removed legacy Redux files and dependencies", () => {
      const root = process.cwd();
      expect(fs.existsSync(path.join(root, "store.ts"))).toBe(false);
      expect(fs.existsSync(path.join(root, "features"))).toBe(false);
      expect(
        fs.existsSync(path.join(root, "providers", "StoreProvider.tsx")),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(root, "types", "general-state-types.ts")),
      ).toBe(false);
      expect(fs.existsSync(path.join(root, "utils", "local-storage.ts"))).toBe(
        false,
      );

      const pkg = JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8"),
      );
      expect(pkg.dependencies["@reduxjs/toolkit"]).toBeUndefined();
      expect(pkg.dependencies["react-redux"]).toBeUndefined();
      expect(pkg.dependencies["@tanstack/react-query"]).toBeDefined();
      expect(pkg.dependencies["zustand"]).toBeDefined();
    });
  });
});
