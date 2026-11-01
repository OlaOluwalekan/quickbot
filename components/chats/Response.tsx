"use client";

import { ResponseProps } from "@/types/chats";
import React, { useState } from "react";
import UserImage from "./UserImage";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import ResponseMD from "./markdown/ResponseMD";
import clsx from "clsx";
import { handleStop, readAloud } from "@/utils/speak";
import { useTranslations } from "next-intl";

const Response = ({
  response,
  image,
}: {
  response: ResponseProps;
  image: string | null;
}) => {
  const t = useTranslations("Chat");
  const [isCopied, setIsCopied] = useState(false);
  const [responseIsCopied, setResponseIsCopied] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isImageResponse =
    response.type === "IMAGE" || Boolean(response.imageUrl);

  const parseMarkdownToText = (markdown: string) => {
    return markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`~>\[\]()!-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleCopyQuestion = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2500);
  };

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
    setResponseIsCopied(true);
    setTimeout(() => {
      setResponseIsCopied(false);
    }, 2500);
  };

  const handleReadClicked = () => {
    const text = parseMarkdownToText(response.response);

    if (isReadingAloud) {
      handleStop(setIsReadingAloud);
    } else {
      readAloud(text, setIsReadingAloud);
    }
  };

  const handleDownloadImage = () => {
    if (!response.imageUrl) return;
    const link = document.createElement("a");
    link.href = response.imageUrl;
    const ext = response.mimeType?.split("/")[1] || "png";
    link.download = `klecx-image-${response.id.slice(0, 8)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formattedTime = (() => {
    try {
      return format(new Date(response.createdAt), "MMM dd, HH:mm");
    } catch {
      return "";
    }
  })();

  return (
    <div
      id={response.id}
      className="flex flex-col gap-5 mb-6 max-w-4xl mx-auto w-full px-2 sm:px-4"
    >
      {/* User Prompt Bubble */}
      <div className="w-full flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-muted">
            <span className="font-semibold text-fg">
              You
            </span>
            {formattedTime && <time>{formattedTime}</time>}
          </div>

          <div className="flex flex-row-reverse gap-2.5 items-end">
            <div className="shrink-0">
              <UserImage image={image} />
            </div>

            <div className="bg-accent text-accent-fg py-3 px-4 rounded-2xl rounded-br-xs shadow-sm text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed">
              {response.question}
            </div>
          </div>

          <div className="mt-1.5 pr-10 flex items-center gap-2">
            <button
              type="button"
              title={t("copyResponse")}
              className={clsx(
                "p-1 rounded-md text-xs transition-colors cursor-pointer",
                isCopied
                  ? "text-success"
                  : "text-subtle hover:text-fg"
              )}
              onClick={() => handleCopyQuestion(response.question)}
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Klecx AI Response Bubble */}
      <div className="w-full flex justify-start">
        <div className="w-full max-w-[95%] sm:max-w-[88%] flex gap-3 items-start">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-accent-soft border border-border flex justify-center items-center text-accent shadow-2xs mt-0.5">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 text-xs text-muted">
              <span className="font-bold text-accent">
                Klecx
              </span>
              {formattedTime && <time>{formattedTime}</time>}
            </div>

            <div className="rounded-2xl rounded-tl-xs border border-border bg-surface p-4 shadow-xs text-fg overflow-hidden">
              {isImageResponse && response.imageUrl ? (
                <div className="flex flex-col gap-3">
                  <div className="relative group rounded-xl overflow-hidden border border-border bg-surface-2 max-w-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={response.imageUrl}
                      alt={response.question || t("generatedImageAlt")}
                      className="w-full h-auto object-cover rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
                    />
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        title="Expand image"
                        className="p-2 rounded-lg bg-surface/90 text-fg hover:bg-surface backdrop-blur-xs cursor-pointer"
                      >
                        <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadImage}
                        title={t("downloadImage")}
                        className="p-2 rounded-lg bg-surface/90 text-fg hover:bg-surface backdrop-blur-xs cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                  {response.response && (
                    <p className="text-xs sm:text-sm text-muted">
                      {response.response}
                    </p>
                  )}
                </div>
              ) : (
                <div className="markdown max-w-none text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed">
                  <ResponseMD response={response.response} />
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 mt-1.5 pl-1 text-subtle">
              <button
                type="button"
                title={t("copyResponse")}
                className={clsx(
                  "inline-flex items-center gap-1 p-1 rounded-md text-xs transition-colors cursor-pointer",
                  responseIsCopied
                    ? "text-success"
                    : "hover:text-fg"
                )}
                onClick={() => handleCopyResponse(response.response)}
              >
                {responseIsCopied ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </button>

              {!isImageResponse && (
                <button
                  type="button"
                  className={clsx(
                    "inline-flex items-center gap-1 p-1 rounded-md text-xs transition-colors cursor-pointer",
                    isReadingAloud
                      ? "text-danger"
                      : "hover:text-fg"
                  )}
                  onClick={handleReadClicked}
                >
                  {isReadingAloud ? (
                    <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </button>
              )}

              {isImageResponse && response.imageUrl && (
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="inline-flex items-center gap-1 p-1 rounded-md text-xs hover:text-fg transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>{t("downloadImage")}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxOpen && response.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-overlay backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-10 right-0 p-2 rounded-full bg-surface text-fg hover:bg-surface-2 cursor-pointer"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={response.imageUrl}
              alt={response.question || t("generatedImageAlt")}
              className="max-w-full max-h-[82vh] object-contain rounded-2xl border border-border shadow-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Response;
