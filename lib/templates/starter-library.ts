export type TemplateCategory =
  | "write"
  | "analyze"
  | "research"
  | "code"
  | "plan"
  | "learn"
  | "image";

export interface StarterTemplate {
  id: string;
  category: TemplateCategory;
  iconName: string;
  mode: "text" | "image";
  titleKey: string;
  descriptionKey: string;
  /** Message key under `Templates` (e.g. `prompts.blog-post`). */
  promptKey: string;
}

export const STARTER_CATEGORIES: Array<{
  id: TemplateCategory;
  labelKey: string;
  iconName: string;
}> = [
  { id: "write", labelKey: "catWrite", iconName: "PenLine" },
  { id: "analyze", labelKey: "catAnalyze", iconName: "BarChart3" },
  { id: "research", labelKey: "catResearch", iconName: "Search" },
  { id: "code", labelKey: "catCode", iconName: "Code2" },
  { id: "plan", labelKey: "catPlan", iconName: "CalendarClock" },
  { id: "learn", labelKey: "catLearn", iconName: "GraduationCap" },
  { id: "image", labelKey: "catImage", iconName: "Image" },
];

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // Write
  {
    id: "exec-summary",
    category: "write",
    iconName: "FileText",
    mode: "text",
    titleKey: "execSummaryTitle",
    descriptionKey: "execSummaryDesc",
    promptKey: "prompts.exec-summary",
  },
  {
    id: "blog-post",
    category: "write",
    iconName: "PenTool",
    mode: "text",
    titleKey: "blogPostTitle",
    descriptionKey: "blogPostDesc",
    promptKey: "prompts.blog-post",
  },
  {
    id: "product-announcement",
    category: "write",
    iconName: "Megaphone",
    mode: "text",
    titleKey: "announcementTitle",
    descriptionKey: "announcementDesc",
    promptKey: "prompts.product-announcement",
  },

  // Analyze
  {
    id: "swot-analysis",
    category: "analyze",
    iconName: "Crosshair",
    mode: "text",
    titleKey: "swotTitle",
    descriptionKey: "swotDesc",
    promptKey: "prompts.swot-analysis",
  },
  {
    id: "tradeoff-matrix",
    category: "analyze",
    iconName: "Scale",
    mode: "text",
    titleKey: "tradeoffTitle",
    descriptionKey: "tradeoffDesc",
    promptKey: "prompts.tradeoff-matrix",
  },
  {
    id: "data-interpretation",
    category: "analyze",
    iconName: "LineChart",
    mode: "text",
    titleKey: "dataInsightsTitle",
    descriptionKey: "dataInsightsDesc",
    promptKey: "prompts.data-interpretation",
  },

  // Research
  {
    id: "market-landscape",
    category: "research",
    iconName: "Compass",
    mode: "text",
    titleKey: "marketLandscapeTitle",
    descriptionKey: "marketLandscapeDesc",
    promptKey: "prompts.market-landscape",
  },
  {
    id: "literature-synthesis",
    category: "research",
    iconName: "BookOpen",
    mode: "text",
    titleKey: "litSynthesisTitle",
    descriptionKey: "litSynthesisDesc",
    promptKey: "prompts.literature-synthesis",
  },
  {
    id: "competitor-teardown",
    category: "research",
    iconName: "Building2",
    mode: "text",
    titleKey: "competitorTeardownTitle",
    descriptionKey: "competitorTeardownDesc",
    promptKey: "prompts.competitor-teardown",
  },

  // Code
  {
    id: "code-refactor",
    category: "code",
    iconName: "Wrench",
    mode: "text",
    titleKey: "refactorTitle",
    descriptionKey: "refactorDesc",
    promptKey: "prompts.code-refactor",
  },
  {
    id: "unit-tests",
    category: "code",
    iconName: "CheckCircle2",
    mode: "text",
    titleKey: "unitTestsTitle",
    descriptionKey: "unitTestsDesc",
    promptKey: "prompts.unit-tests",
  },
  {
    id: "api-design",
    category: "code",
    iconName: "Network",
    mode: "text",
    titleKey: "apiDesignTitle",
    descriptionKey: "apiDesignDesc",
    promptKey: "prompts.api-design",
  },

  // Plan
  {
    id: "sprint-plan",
    category: "plan",
    iconName: "Layers",
    mode: "text",
    titleKey: "sprintPlanTitle",
    descriptionKey: "sprintPlanDesc",
    promptKey: "prompts.sprint-plan",
  },
  {
    id: "launch-checklist",
    category: "plan",
    iconName: "Rocket",
    mode: "text",
    titleKey: "launchChecklistTitle",
    descriptionKey: "launchChecklistDesc",
    promptKey: "prompts.launch-checklist",
  },
  {
    id: "quarterly-roadmap",
    category: "plan",
    iconName: "Milestone",
    mode: "text",
    titleKey: "roadmapTitle",
    descriptionKey: "roadmapDesc",
    promptKey: "prompts.quarterly-roadmap",
  },

  // Learn
  {
    id: "explain-eli5",
    category: "learn",
    iconName: "Sparkles",
    mode: "text",
    titleKey: "eli5Title",
    descriptionKey: "eli5Desc",
    promptKey: "prompts.explain-eli5",
  },
  {
    id: "knowledge-quiz",
    category: "learn",
    iconName: "HelpCircle",
    mode: "text",
    titleKey: "quizTitle",
    descriptionKey: "quizDesc",
    promptKey: "prompts.knowledge-quiz",
  },
  {
    id: "mastery-curriculum",
    category: "learn",
    iconName: "GraduationCap",
    mode: "text",
    titleKey: "curriculumTitle",
    descriptionKey: "curriculumDesc",
    promptKey: "prompts.mastery-curriculum",
  },

  // Image
  {
    id: "studio-portrait",
    category: "image",
    iconName: "Camera",
    mode: "image",
    titleKey: "portraitTitle",
    descriptionKey: "portraitDesc",
    promptKey: "prompts.studio-portrait",
  },
  {
    id: "vector-logo",
    category: "image",
    iconName: "Palette",
    mode: "image",
    titleKey: "vectorLogoTitle",
    descriptionKey: "vectorLogoDesc",
    promptKey: "prompts.vector-logo",
  },
  {
    id: "concept-art",
    category: "image",
    iconName: "Image",
    mode: "image",
    titleKey: "conceptArtTitle",
    descriptionKey: "conceptArtDesc",
    promptKey: "prompts.concept-art",
  },
];
