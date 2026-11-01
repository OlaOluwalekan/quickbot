"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Composer } from "@/components/workspace/composer";

export interface GreetingSectionProps {
  userName: string;
  prefilledPrompt?: string;
  prefilledMode?: "text" | "image";
  credits?: { plan: string; balance: number };
}

export function GreetingSection({
  userName,
  prefilledPrompt = "",
  prefilledMode,
  credits,
}: GreetingSectionProps) {
  const tHome = useTranslations("Home");

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    const name = userName ? userName.split(" ")[0] : "";
    if (hour < 12) {
      return tHome("greetingMorning", { name: name || "there" });
    }
    if (hour < 18) {
      return tHome("greetingAfternoon", { name: name || "there" });
    }
    return tHome("greetingEvening", { name: name || "there" });
  }, [userName, tHome]);

  return (
    <section className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto w-full pt-4 pb-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent mb-3 border border-border">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span>Klecx AI Studio</span>
      </div>

      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-fg mb-6">
        {greeting}
      </h1>

      <div className="w-full text-left">
        <Composer
          size="large"
          initialPrompt={prefilledPrompt}
          initialMode={prefilledMode}
          autoFocus={false}
          credits={credits}
        />
      </div>
    </section>
  );
}

export default GreetingSection;
