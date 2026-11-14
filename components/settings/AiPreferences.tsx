"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api/client";

export interface AiPreferencesProps {
  initialWebSearchEnabled?: boolean;
}

export default function AiPreferences({
  initialWebSearchEnabled = true,
}: AiPreferencesProps) {
  const t = useTranslations("Settings.ai");
  const [webSearchEnabled, setWebSearchEnabled] = React.useState<boolean>(
    initialWebSearchEnabled
  );
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    api<{ data: { webSearchEnabled?: boolean } }>("/api/v1/me/preferences")
      .then((res) => {
        if (isMounted && res?.data?.webSearchEnabled !== undefined) {
          setWebSearchEnabled(res.data.webSearchEnabled);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = async (checked: boolean) => {
    setWebSearchEnabled(checked);
    setIsUpdating(true);
    try {
      await api("/api/v1/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ webSearchEnabled: checked }),
      });
      toast.success(checked ? "Web search enabled" : "Web search disabled");
    } catch {
      setWebSearchEnabled(!checked);
      toast.error("Failed to update AI preferences");
    } finally {
      setIsUpdating(false);
    }
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
