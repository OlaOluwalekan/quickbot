"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Activity, ExternalLink, ShieldCheck, Cpu, Key, Database, Cloud, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StatusPage() {
  const t = useTranslations("Status");

  const services = [
    {
      id: "ai",
      name: t("services.ai.name"),
      desc: t("services.ai.desc"),
      icon: Cpu,
      status: "operational",
    },
    {
      id: "auth",
      name: t("services.auth.name"),
      desc: t("services.auth.desc"),
      icon: Key,
      status: "operational",
    },
    {
      id: "db",
      name: t("services.db.name"),
      desc: t("services.db.desc"),
      icon: Database,
      status: "operational",
    },
    {
      id: "storage",
      name: t("services.storage.name"),
      desc: t("services.storage.desc"),
      icon: Cloud,
      status: "operational",
    },
    {
      id: "email",
      name: t("services.email.name"),
      desc: t("services.email.desc"),
      icon: Mail,
      status: "operational",
    },
  ];

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Activity className="h-3.5 w-3.5" />
            <span>{t("title")}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
            {t("title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        {/* Global Operational Status Banner */}
        <div className="rounded-3xl border border-success/30 bg-success/5 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success/20 text-success">
              <CheckCircle2 className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </span>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-fg">{t("allOperational")}</h2>
              <p className="text-xs text-fg-muted pt-0.5">{t("uptimeNotice")}</p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="shrink-0 text-xs rounded-xl">
            <a
              href="https://betteruptime.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <span>{t("viewMonitor")}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>

        {/* Core Services Breakdown */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-fg-subtle border-b border-border pb-3">
            <span className="font-semibold uppercase tracking-wider text-fg">{t("servicesHeading")}</span>
            <span className="font-mono">{t("lastChecked")}</span>
          </div>

          <div className="space-y-3">
            {services.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 rounded-2xl border border-border/70 bg-surface gap-3 shadow-2xs"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-fg">{s.name}</h3>
                      <p className="text-xs text-fg-muted leading-relaxed">{s.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <span className="flex h-2 w-2 rounded-full bg-success"></span>
                    <span className="text-xs font-semibold text-success">{t("operational")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incident History */}
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-fg">{t("incidentHeading")}</h3>
          <div className="rounded-2xl border border-border/70 bg-surface p-6 text-xs text-fg-muted text-center sm:text-left flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-success shrink-0" />
            <span>{t("noIncidents")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
