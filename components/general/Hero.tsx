"use client";

import TypingText from "../ui/text/TypingText";
import LinkButton from "../ui/button/LinkButton";
import { useTranslations } from "next-intl";
import { FaBolt, FaCode, FaImage, FaWandMagicSparkles } from "react-icons/fa6";

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
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-80 w-85 -translate-x-1/2 rounded-full bg-linear-to-tr from-indigo-500/20 via-sky-500/15 to-purple-500/10 blur-3xl sm:w-170"
      />

      {/* Pill Badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-medium text-indigo-600 shadow-2xs sm:text-sm dark:text-indigo-300">
        <FaWandMagicSparkles className="text-indigo-500" />
        <span>{t("badge")}</span>
      </div>

      {/* Main Headline */}
      <h1 className="max-w-4xl text-4xl leading-[1.1] font-extrabold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl dark:text-white">
        {t("heroTitle")}{" "}
        <span className="bg-linear-to-r from-indigo-500 via-purple-500 to-sky-400 bg-clip-text text-transparent">
          {t("heroHighlight", { appName: t2("appName") })}
        </span>
      </h1>

      {/* Dynamic Typing Subheading */}
      <div className="mt-5 flex min-h-9 items-center justify-center px-2 sm:min-h-11">
        <TypingText
          texts={localizedTypingTexts}
          className="text-lg font-semibold text-indigo-600 sm:text-2xl dark:text-sky-400"
          cursorStyleClass="inline text-lg sm:text-2xl text-indigo-500"
        />
      </div>

      {/* Hero Description */}
      <p className="mt-4 max-w-2xl px-2 text-sm leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
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
      <div className="mt-14 w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/90 bg-white/85 text-left shadow-2xl shadow-indigo-500/10 backdrop-blur-xl dark:border-slate-800/90 dark:bg-slate-900/85">
        {/* Window Topbar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              klecx.ai — Studio Workspace
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
            <FaBolt className="text-[10px]" />
            <span>SSE Live Stream</span>
          </div>
        </div>

        {/* Mock Conversation Preview */}
        <div className="grid grid-cols-1 items-center gap-6 p-5 sm:p-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="max-w-[85%] self-end rounded-2xl rounded-br-xs bg-linear-to-r from-indigo-600 to-indigo-500 px-4 py-3 text-xs text-white shadow-sm sm:text-sm">
              Design a resilient SSE streaming hook in TypeScript and generate a
              futuristic hero illustration.
            </div>
            <div className="w-full space-y-2 self-start rounded-2xl rounded-tl-xs border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 sm:text-sm dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                <FaCode />
                <span>Klecx AI • Streaming via Gemini Interactions API</span>
              </div>
              <p className="leading-relaxed text-slate-600 dark:text-slate-300">
                Using{" "}
                <code className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">
                  ai.interactions.create
                </code>{" "}
                with{" "}
                <code className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">
                  stream: true
                </code>
                , each{" "}
                <code className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-500">
                  step.delta
                </code>{" "}
                chunk streams directly to your client in real time.
              </p>
            </div>
          </div>

          <div className="relative flex min-h-47.5 flex-col justify-between overflow-hidden rounded-2xl border border-indigo-500/25 bg-linear-to-br from-indigo-950 via-slate-900 to-sky-950 p-5 text-white lg:col-span-5">
            <div className="z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold backdrop-blur-md">
                <FaImage className="text-sky-400" />
                Nano Banana 2.1
              </span>
              <span className="font-mono text-[11px] text-sky-300">
                1024×1024
              </span>
            </div>
            <div className="z-10 my-4">
              <p className="text-sm font-semibold text-white/95">
                Instant Visual Synthesis
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Switch from chat to image generation in one click and download
                studio-grade renders.
              </p>
            </div>
            <div className="absolute -right-10 -bottom-10 h-36 w-36 rounded-full bg-sky-500/25 blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
