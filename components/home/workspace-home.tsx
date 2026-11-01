"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useHomeData, type HomeData } from "@/lib/api/hooks/home";
import { useUiStore } from "@/lib/stores/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GreetingSection } from "./greeting-section";
import { OnboardingChecklist } from "./onboarding-checklist";
import { RecentWorkspaces } from "./recent-workspaces";
import { StarterLibrary } from "./starter-library";
import { ProjectsStrip } from "./projects-strip";
import { SharedWorkspaces } from "./shared-workspaces";
import { CreditsCard } from "./credits-card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectSchema, type CreateProjectInput } from "@/lib/schemas/workspace";
import { useCreateProject } from "@/lib/api/hooks/projects";
import { toast } from "sonner";
import type { StarterTemplate } from "@/lib/templates/starter-library";

export interface WorkspaceHomeProps {
  userId: string;
  userName: string;
  initialData?: HomeData;
}

export function WorkspaceHome({
  userId,
  userName,
  initialData,
}: WorkspaceHomeProps) {
  const tHome = useTranslations("Home");
  const tAppShell = useTranslations("AppShell");
  const tCommon = useTranslations("Common");

  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);

  React.useEffect(() => {
    setCurrentPageTitle("");
    setCurrentPageId(null);
  }, [setCurrentPageTitle, setCurrentPageId]);

  const { data, isLoading, isError, refetch } = useHomeData(userId, {
    initialData,
  });

  const [selectedPrompt, setSelectedPrompt] = React.useState("");
  const [selectedMode, setSelectedMode] = React.useState<"text" | "image">("text");

  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const createProjectMutation = useCreateProject(userId);

  const createProjectForm = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "" },
  });

  const handleUseTemplate = (template: StarterTemplate) => {
    setSelectedPrompt(template.promptTemplate);
    setSelectedMode(template.mode);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // jsdom or unsupported environments
    }
  };

  const handleCreateProjectSubmit = async (values: CreateProjectInput) => {
    try {
      await createProjectMutation.mutateAsync({ name: values.name.trim() });
      toast.success(tAppShell("projectCreated"));
      setCreateProjectOpen(false);
      createProjectForm.reset({ name: "" });
      refetch();
    } catch {
      toast.error(tCommon("cancel"));
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 animate-fade-in">
        <div className="flex flex-col items-center justify-center space-y-3 pt-6">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-28 w-full max-w-3xl rounded-3xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-3">
          <AlertCircle className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-fg mb-1">
          {tHome("errorLoadingHome")}
        </h2>
        <p className="text-xs sm:text-sm text-muted mb-4 max-w-sm">
          Please check your connection and try refreshing your workspace data.
        </p>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{tHome("retry")}</span>
        </Button>
      </div>
    );
  }

  const homeData = data!;

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 pb-16">
        {/* 1. Greeting + Large Composer */}
        <GreetingSection
          userName={userName}
          prefilledPrompt={selectedPrompt}
          prefilledMode={selectedMode}
          credits={homeData.credits}
        />

        {/* 6. Onboarding Checklist (for brand new accounts) */}
        <OnboardingChecklist
          onboarding={homeData.onboarding}
          onTryTemplate={() => {
            const starter = document.getElementById("starter-library-section");
            starter?.scrollIntoView({ behavior: "smooth" });
          }}
          onRequestNewProject={() => {
            createProjectForm.reset({ name: "" });
            setCreateProjectOpen(true);
          }}
        />

        {/* 2. Continue where you left off (recent workspaces) */}
        <RecentWorkspaces items={homeData.recent} />

        {/* 3. Starter Library */}
        <div id="starter-library-section">
          <StarterLibrary onUseTemplate={handleUseTemplate} />
        </div>

        {/* 4. Projects Strip */}
        <ProjectsStrip
          items={homeData.projects}
          onRequestNewProject={() => {
            createProjectForm.reset({ name: "" });
            setCreateProjectOpen(true);
          }}
        />

        {/* 5. Shared With Me (only when non-empty) */}
        <SharedWorkspaces items={homeData.sharedWithMe} />

        {/* 7. Credits & Subscription Card */}
        <CreditsCard credits={homeData.credits} />
      </div>

      {/* Create Project Dialog */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent>
          <Form {...createProjectForm}>
            <form
              onSubmit={createProjectForm.handleSubmit(handleCreateProjectSubmit)}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{tAppShell("newProject")}</DialogTitle>
              </DialogHeader>
              <FormField
                control={createProjectForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tAppShell("projects")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tAppShell("newProjectPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateProjectOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={createProjectMutation.isPending}>
                  {tCommon("save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkspaceHome;
