"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "@/lib/api/hooks/me";

export interface AiPreferencesProps {
  userId: string;
  initialWebSearchEnabled?: boolean;
}

export default function AiPreferences({
  userId,
  initialWebSearchEnabled = true,
}: AiPreferencesProps) {
  const t = useTranslations("Settings.ai");
  const { data: preferences } = useUserPreferences(userId);
  const update = useUpdateUserPreferences(userId);
  const webSearchEnabled =
    preferences?.webSearchEnabled ?? initialWebSearchEnabled;
  const isUpdating = update.isPending;

  const handleToggle = (checked: boolean) => {
    update.mutate(
      { webSearchEnabled: checked },
      {
        onSuccess: () =>
          toast.success(checked ? t("searchOnToast") : t("searchOffToast")),
        onError: () => toast.error(t("saveError")),
      }
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-bold tracking-tight text-fg">
          {t("title")}
        </h3>
      </div>
      <p className="text-xs text-muted">
        {t("subtitle")}
      </p>

      <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-fg">
            {t("searchLabel")}
          </span>
          <span className="text-[11px] text-muted">
            {t("searchHint")}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
          <Switch
            checked={webSearchEnabled}
            onCheckedChange={handleToggle}
            disabled={isUpdating}
            data-testid="settings-web-search-toggle"
            aria-label={t("searchLabel")}
          />
        </div>
      </div>
    </div>
  );
}
