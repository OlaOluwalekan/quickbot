"use client";

import TypingText from "../ui/text/TypingText";
import LinkButton from "../ui/button/LinkButton";
import { useTranslations } from "next-intl";
import { Code2, Image as ImageIcon, Sparkles, Zap } from "lucide-react";

const Hero = () => {
  const t = useTranslations("Landing");
  const t2 = useTranslations("Common");

  const localizedTypingTexts = [
    t("typing1"),
    t("typing2"),
    t("typing3"),
    t("typing4"),
    t("typing5"),
  ];

  return (
    <section className="relative flex flex-col items-center pt-10 pb-16 text-center sm:pt-16 sm:pb-24">
      {/* Ambient Background Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-80 w-85 -translate-x-1/2 rounded-full bg-accent-soft blur-3xl sm:w-170"
      />

      {/* Pill Badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-accent-soft px-3.5 py-1.5 text-xs font-medium text-accent shadow-2xs sm:text-sm">
        <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
        <span>{t("badge")}</span>
      </div>

      {/* Main Headline */}
      <h1 className="max-w-4xl text-4xl leading-[1.1] font-extrabold tracking-tight text-fg sm:text-6xl lg:text-7xl">
        {t("heroTitle")}{" "}
        <span className="text-accent">
          {t("heroHighlight", { appName: t2("appName") })}
        </span>
      </h1>

      {/* Dynamic Typing Subheading */}
      <div className="mt-5 flex min-h-9 items-center justify-center px-2 sm:min-h-11">
        <TypingText
          texts={localizedTypingTexts}
          className="text-lg font-semibold text-accent sm:text-2xl"
          cursorStyleClass="inline text-lg sm:text-2xl text-accent"
        />
      </div>

      {/* Hero Description */}
      <p className="mt-4 max-w-2xl px-2 text-sm leading-relaxed text-muted sm:text-lg">
        {t("heroDescription")}
      </p>

      {/* CTA Buttons */}
      <div className="mt-8 flex w-full flex-col items-center justify-center gap-3.5 px-4 sm:w-auto sm:flex-row">
        <LinkButton
          href="/auth/register"
          size="large"
          text={t("getStarted")}
          theme="primary"
        />
        <LinkButton
          href="#features"
          size="medium"
          text={t("exploreFeatures")}
          theme="outline"
        />
      </div>

      {/* Interactive Product Preview Mockup Card */}
      <div className="mt-14 w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface text-left shadow-lg backdrop-blur-xl">
        {/* Window Topbar */}
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-danger" />
            <span className="h-3 w-3 rounded-full bg-warning" />
            <span className="h-3 w-3 rounded-full bg-success" />
            <span className="ml-2 text-xs font-semibold text-muted">
              klecx.ai — Studio Workspace
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
            <Zap className="h-3 w-3" strokeWidth={1.5} />
            <span>SSE Live Stream</span>
          </div>
        </div>

        {/* Mock Conversation Preview */}
        <div className="grid grid-cols-1 items-center gap-6 p-5 sm:p-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="max-w-[85%] self-end rounded-2xl rounded-br-xs bg-accent px-4 py-3 text-xs text-accent-fg shadow-sm sm:text-sm">
              Design a resilient SSE streaming hook in TypeScript and generate a
              futuristic hero illustration.
            </div>
            <div className="w-full space-y-2 self-start rounded-2xl rounded-tl-xs border border-border bg-surface-2 p-4 text-xs text-fg sm:text-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-accent">
                <Code2 className="h-4 w-4" strokeWidth={1.5} />
                <span>Klecx AI • Streaming via Gemini Interactions API</span>
              </div>
              <p className="leading-relaxed text-muted">
                Using{" "}
                <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent">
                  ai.interactions.create
                </code>{" "}
                with{" "}
                <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent">
                  stream: true
                </code>
                , each{" "}
                <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent">
                  step.delta
                </code>{" "}
                chunk streams directly to your client in real time.
              </p>
            </div>
          </div>

          <div className="relative flex min-h-47.5 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface-3 p-5 text-fg lg:col-span-5">
            <div className="z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold shadow-2xs">
                <ImageIcon className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
                Nano Banana 2.1
              </span>
              <span className="font-mono text-[11px] text-muted">
                1024×1024
              </span>
            </div>
            <div className="z-10 my-4">
              <p className="text-sm font-semibold text-fg">
                Instant Visual Synthesis
              </p>
              <p className="mt-1 text-xs text-muted">
                Switch from chat to image generation in one click and download
                studio-grade renders.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
