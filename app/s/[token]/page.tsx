import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  Sparkles,
  FileDown,
  FileText,
  ExternalLink,
  Globe,
  User as UserIcon,
} from "lucide-react";
import {
  resolvePublicShareByToken,
  shareViewRateLimitKey,
  type PublicSharePayloadDto,
} from "@/server/services/share";
import { limit, resolveClientIp } from "@/server/http/rate-limit";
import { env } from "@/server/env";
import { ApiError } from "@/server/http/errors";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared on Klecx",
  description: "Read-only shared view on Klecx.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
  referrer: "no-referrer",
  openGraph: {
    title: "Shared on Klecx",
    description: "Read-only shared view on Klecx.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Shared on Klecx",
    description: "Read-only shared view on Klecx.",
  },
};

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Same validated IP resolution as the API route (only trusts proxy headers when TRUST_PROXY=true)
  const ip = resolveClientIp({ headers: await headers() }, env.TRUST_PROXY);

  let payload: PublicSharePayloadDto;
  try {
    await limit("share:view", shareViewRateLimitKey(ip, token));
    payload = await resolvePublicShareByToken(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      return (
        <div className="min-h-screen bg-bg text-fg flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 text-center space-y-3">
            <h1 className="text-lg font-semibold text-fg">Too many requests</h1>
            <p className="text-sm text-muted">
              Please wait a moment and refresh this page to view the shared link.
            </p>
          </div>
        </div>
      );
    }
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    // Real failures (DB outage etc.) surface via the error boundary instead of masquerading as 404
    throw err;
  }

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-fg hover:text-accent transition-colors shrink-0"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-2xs">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-sm sm:text-base tracking-tight">Klecx</span>
            </Link>
            <span className="text-border select-none">/</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted shrink-0">
              <Globe className="h-3 w-3 text-accent" />
              <span>
                {payload.scope === "WORKSPACE" ? "Shared workspace" : "Shared response"}
              </span>
            </span>
          </div>

          <Button asChild size="sm" className="shrink-0 text-xs sm:text-sm">
            <Link href="/auth/register">Create your own workspace</Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 space-y-8">
        {/* Title & Author Header */}
        <div className="space-y-2 border-b border-border pb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
            {payload.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {payload.authorName && (
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <UserIcon className="h-3.5 w-3.5 text-accent" />
                <span>Shared by {payload.authorName}</span>
              </span>
            )}
            <span>
              Shared on{" "}
              {new Date(payload.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Responses Timeline */}
        {payload.responses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
            No responses in this shared view yet.
          </div>
        ) : (
          <div className="space-y-8">
            {payload.responses.map((res) => (
              <article
                key={res.id}
                id={`response-${res.id}`}
                className="space-y-4"
              >
                {/* Prompt Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-2xl rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm sm:text-base text-fg shadow-2xs space-y-2.5">
                    {res.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {res.attachments.map((att) =>
                          att.mime.startsWith("image/") ? (
                            <a
                              key={att.id}
                              href={att.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-xl border border-border bg-surface hover:opacity-90 transition-opacity"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={att.signedUrl}
                                alt={att.originalName}
                                className="max-h-40 w-auto object-cover"
                              />
                            </a>
                          ) : (
                            <a
                              key={att.id}
                              href={att.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-3 transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
                              <span className="max-w-44 truncate">
                                {att.originalName}
                              </span>
                            </a>
                          )
                        )}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {res.prompt}
                    </div>
                  </div>
                </div>

                {/* Assistant Response Card */}
                <div className="flex gap-3 items-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-2xs mt-0.5">
                    <Sparkles className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface p-4 sm:p-6 text-sm sm:text-base text-fg shadow-2xs space-y-4">
                    {res.kind === "IMAGE" && res.imageUrl ? (
                      <div className="overflow-hidden rounded-xl border border-border bg-surface-2 max-w-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={res.imageUrl}
                          alt={res.prompt}
                          className="w-full h-auto object-contain"
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto leading-relaxed">
                        <Markdown
                          content={res.content}
                          citations={res.citations.map((c) => ({
                            index: c.index,
                            source: c.source as "GROUNDING" | "ATTACHMENT" | "MODEL_PROVIDED",
                            title: c.title,
                            url: c.url,
                            snippet: c.snippet ?? undefined,
                          }))}
                        />
                      </div>
                    )}

                    {/* Generated Documents */}
                    {res.generatedDocuments.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {res.generatedDocuments.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.signedUrl}
                            download={doc.originalName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 hover:bg-surface px-3 py-2 text-xs font-medium text-fg transition-colors"
                          >
                            <FileDown className="h-4 w-4 text-accent shrink-0" />
                            <span className="max-w-56 truncate">
                              {doc.originalName}
                            </span>
                            <span className="text-accent underline ml-1">
                              Download
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Citations / Sources */}
                    {res.citations.length > 0 && (
                      <div className="border-t border-border/60 pt-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                          Sources ({res.citations.length})
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {res.citations.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs"
                            >
                              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-accent/15 px-1 font-mono text-[10px] font-semibold text-accent shrink-0 mt-0.5">
                                {c.index}
                              </span>
                              <div className="min-w-0 flex-1">
                                {c.url ? (
                                  <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-fg hover:text-accent inline-flex items-center gap-1 truncate max-w-full"
                                  >
                                    <span className="truncate">{c.title}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="font-medium text-fg truncate block">
                                    {c.title}
                                  </span>
                                )}
                                {c.snippet && (
                                  <p className="text-[11px] text-muted line-clamp-2 mt-0.5">
                                    {c.snippet}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-border bg-surface/60 py-6 mt-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <p>
            Shared via <span className="font-semibold text-fg">Klecx</span> — AI workspace for deep thinking and collaboration.
          </p>
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link href="/auth/register">Create your own workspace</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
