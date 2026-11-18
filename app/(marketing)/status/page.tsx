import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  CheckCircle2,
  AlertTriangle,
  Activity,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Key,
  Database,
  Cloud,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkSystemReadiness } from "@/server/services/system-status";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Status");
  return {
    title: `${t("title")} · System Status`,
    description: t("subtitle"),
    alternates: {
      canonical: "/status",
    },
    openGraph: {
      title: `${t("title")} · System Status`,
      description: t("subtitle"),
      url: "/status",
    },
  };
}

export default async function StatusPage() {
  const t = await getTranslations("Status");
  const readiness = await checkSystemReadiness();
  const isAllOperational = readiness.status === "operational";
  const externalStatusUrl = process.env.STATUS_PAGE_URL;

  const formattedTime = new Date(readiness.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  const services = [
    {
      id: "ai" as const,
      name: t("services.ai.name"),
      desc: t("services.ai.desc"),
      icon: Cpu,
      status: readiness.services.ai,
    },
    {
      id: "auth" as const,
      name: t("services.auth.name"),
      desc: t("services.auth.desc"),
      icon: Key,
      status: readiness.services.auth,
    },
    {
      id: "db" as const,
      name: t("services.db.name"),
      desc: t("services.db.desc"),
      icon: Database,
      status: readiness.services.db,
    },
    {
      id: "storage" as const,
      name: t("services.storage.name"),
      desc: t("services.storage.desc"),
      icon: Cloud,
      status: readiness.services.storage,
    },
    {
      id: "email" as const,
      name: t("services.email.name"),
      desc: t("services.email.desc"),
      icon: Mail,
      status: readiness.services.email,
    },
  ];

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-10 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Activity className="h-3.5 w-3.5" />
            <span>{t("title")}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-fg-muted">
            {t("subtitle")}
          </p>
        </div>

        {/* Global Operational Status Banner */}
        <div
          className={`flex flex-col items-center justify-between gap-6 rounded-3xl border p-6 shadow-xs sm:flex-row sm:p-8 ${
            isAllOperational
              ? "border-success/30 bg-success/5"
              : "border-warning/30 bg-warning/5"
          }`}
        >
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                isAllOperational
                  ? "bg-success/20 text-success"
                  : "bg-warning/20 text-warning"
              }`}
            >
              {isAllOperational ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
              {isAllOperational && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-success"></span>
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg sm:text-xl">
                {isAllOperational ? t("allOperational") : t("someDegraded")}
              </h2>
              <p className="pt-0.5 text-xs text-fg-muted">{t("uptimeNotice")}</p>
            </div>
          </div>

          {externalStatusUrl && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl text-xs"
            >
              <a
                href={externalStatusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <span>{t("viewMonitor")}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>

        {/* Core Services Breakdown */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3 text-xs text-fg-subtle">
            <span className="font-semibold uppercase tracking-wider text-fg">
              {t("servicesHeading")}
            </span>
            <span className="font-mono">{t("lastChecked", { time: formattedTime })}</span>
          </div>

          <div className="space-y-3">
            {services.map((s) => {
              const Icon = s.icon;
              const isServiceOp = s.status === "operational";
              return (
                <div
                  key={s.id}
                  className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-border/70 bg-surface p-4 shadow-2xs sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="flex items-start gap-3.5 sm:items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-fg">{s.name}</h3>
                      <p className="text-xs leading-relaxed text-fg-muted">{s.desc}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <span
                      className={`flex h-2 w-2 rounded-full ${
                        isServiceOp ? "bg-success" : "bg-warning"
                      }`}
                    ></span>
                    <span
                      className={`text-xs font-semibold ${
                        isServiceOp ? "text-success" : "text-warning"
                      }`}
                    >
                      {isServiceOp ? t("operational") : t("degraded")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incident History */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-fg">
            {t("incidentHeading")}
          </h3>
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface p-6 text-center text-xs text-fg-muted sm:text-left">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
            <span>{t("noIncidents")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
