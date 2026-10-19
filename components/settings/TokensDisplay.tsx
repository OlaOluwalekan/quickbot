"use client";

import { SessionProps } from "@/types/user";
import BasicButton from "../ui/button/BasicButton";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/utils/format";
import { format } from "date-fns";
import { FaCoins } from "react-icons/fa6";

interface TokenUsageRecord {
  id: string;
  responseId: string;
  token: number;
  usedAt: string;
}

const TokensDisplay = ({ user }: { user: SessionProps }) => {
  const t = useTranslations("Settings");
  const [tokens, setTokens] = useState<number>(user?.token ?? 0);
  const [history, setHistory] = useState<TokenUsageRecord[]>([]);

  useEffect(() => {
    fetch("/api/user/tokens")
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && json.data) {
          if (typeof json.data.tokens === "number") {
            setTokens(json.data.tokens);
          }
          if (Array.isArray(json.data.usageHistory)) {
            setHistory(json.data.usageHistory.slice(0, 6));
          }
        }
      })
      .catch(() => {
        // Keep initial session token balance
      });
  }, []);

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-sky-500/5 to-transparent p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <FaCoins />
            <span>{t("tokenBalanceTitle")}</span>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {formatNumber(tokens)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {t("tokenBalanceSubtitle")}
          </p>
        </div>

        <BasicButton
          type="button"
          text="Request Tokens"
          size="small"
          theme="primary"
          disabled={tokens > 0}
          title={
            tokens > 0
              ? `You have ${tokens} tokens remaining.`
              : "Request token top-up"
          }
        />
      </div>

      {/* Recent Token Activity Table */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {t("usageHistoryTitle")}
        </h4>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
            {t("noTokenUsage")}
          </p>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">
                    {t("usageDate")}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right">
                    {t("usageTokens")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                      {(() => {
                        try {
                          return format(
                            new Date(item.usedAt),
                            "MMM dd, yyyy HH:mm"
                          );
                        } catch {
                          return item.usedAt;
                        }
                      })()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      -{item.token}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokensDisplay;
