"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "./query-keys";
import type { UpdatePreferencesInput } from "@/lib/schemas/user-preferences";

export interface UserPreferencesDto {
  userId: string;
  uiLocale: string | null;
  aiLanguage: string | null;
}

export interface UserCreditsDto {
  tokens: number;
}

export function useUserPreferences(
  userId: string,
  options?: Omit<
    UseQueryOptions<UserPreferencesDto, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.me.preferences(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      api<UserPreferencesDto>("/api/v1/me/preferences", { signal }),
    ...options,
  });
}

export function useUpdateUserPreferences(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      api<UserPreferencesDto>("/api/v1/me/preferences", {
        method: "PATCH",
        body: input,
      }),
    onMutate: async (input) => {
      const key = queryKeys.me.preferences(userId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<UserPreferencesDto>(key);
      if (previous) {
        queryClient.setQueryData<UserPreferencesDto>(key, {
          ...previous,
          ...(input.uiLocale !== undefined ? { uiLocale: input.uiLocale } : {}),
          ...(input.aiLanguage !== undefined
            ? { aiLanguage: input.aiLanguage }
            : {}),
        });
      }

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.me.preferences(userId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.me.preferences(userId),
      });
    },
  });
}

export function useCredits(
  userId: string,
  options?: Omit<UseQueryOptions<UserCreditsDto, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.me.credits(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      api<UserCreditsDto>("/api/user/tokens", { signal }),
    ...options,
  });
}
