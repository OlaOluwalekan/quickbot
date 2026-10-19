"use client";

import TypingText from "../ui/text/TypingText";
import LinkButton from "../ui/button/LinkButton";
import { useTranslations } from "next-intl";
import {
  FaBolt,
  FaCode,
  FaImage,
  FaWandMagicSparkles,
} from "react-icons/fa6";

const Hero = () => {
  const t = useTranslations("Landing");

  const localizedTypingTexts = [
    t("typing1"),
    t("typing2"),
    t("typing3"),
    t("typing4"),
    t("typing5"),
  ];

  return (
    <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 flex flex-col items-center text-center">
      {/* Ambient Background Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] sm:w-[680px] h-[320px] rounded-full bg-gradient-to-tr from-indigo-500/20 via-sky-500/15 to-purple-500/10 blur-3xl -z-10"
      />

      {/* Pill Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs sm:text-sm font-medium mb-6 shadow-2xs">
        <FaWandMagicSparkles className="text-indigo-500" />
        <span>{t("badge")}</span>
      </div>

      {/* Main Headline */}
      <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl leading-[1.1]">
        {t("heroTitle")}{" "}
        <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-400 bg-clip-text text-transparent">
          {t("heroHighlight")}
        </span>
      </h1>

      {/* Dynamic Typing Subheadline */}
      <div className="mt-5 min-h-[36px] sm:min-h-[44px] flex items-center justify-center px-2">
        <TypingText
          texts={localizedTypingTexts}
          className="font-semibold text-lg sm:text-2xl text-indigo-600 dark:text-sky-400"
          cursorStyleClass="inline text-lg sm:text-2xl text-indigo-500"
        />
      </div>

      {/* Hero Description */}
      <p className="mt-4 text-sm sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed px-2">
        {t("heroDescription")}
      </p>

      {/* CTA Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full sm:w-auto px-4">
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
      <div className="mt-14 w-full max-w-5xl rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl shadow-2xl shadow-indigo-500/10 overflow-hidden text-left">
        {/* Window Topbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              klecx.ai — Studio Workspace
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
            <FaBolt className="text-[10px]" />
            <span>SSE Live Stream</span>
          </div>
        </div>

        {/* Mock Conversation Preview */}
        <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="self-end max-w-[85%] rounded-2xl rounded-br-xs bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-4 py-3 text-xs sm:text-sm shadow-sm">
              Design a resilient SSE streaming hook in TypeScript and generate a futuristic hero illustration.
            </div>
            <div className="self-start w-full rounded-2xl rounded-tl-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 p-4 text-xs sm:text-sm text-slate-700 dark:text-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                <FaCode />
                <span>Klecx AI • Streaming via Gemini Interactions API</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Using <code className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">ai.interactions.create</code> with <code className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500">stream: true</code>, each <code className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500">step.delta</code> chunk streams directly to your client in real time.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-950 via-slate-900 to-sky-950 p-5 text-white flex flex-col justify-between min-h-[190px] relative overflow-hidden">
            <div className="flex items-center justify-between z-10">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-md">
                <FaImage className="text-sky-400" />
                Nano Banana 2.1
              </span>
              <span className="text-[11px] text-sky-300 font-mono">1024×1024</span>
            </div>
            <div className="my-4 z-10">
              <p className="text-sm font-semibold text-white/95">
                Instant Visual Synthesis
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Switch from chat to image generation in one click and download studio-grade renders.
              </p>
            </div>
            <div className="w-36 h-36 rounded-full bg-sky-500/25 blur-2xl absolute -bottom-10 -right-10" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
