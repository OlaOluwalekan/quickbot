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
  promptTemplate: string;
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
    promptTemplate:
      "Please synthesize the following meeting or project notes into a structured executive summary with key decisions, risks, and next steps:\n\n{{notes}}",
  },
  {
    id: "blog-post",
    category: "write",
    iconName: "PenTool",
    mode: "text",
    titleKey: "blogPostTitle",
    descriptionKey: "blogPostDesc",
    promptTemplate:
      "Draft an engaging, publication-ready article on {{topic}} tailored for {{audience}}. Include an attention-grabbing hook, 3 key insights with examples, and a forward-looking conclusion.",
  },
  {
    id: "product-announcement",
    category: "write",
    iconName: "Megaphone",
    mode: "text",
    titleKey: "announcementTitle",
    descriptionKey: "announcementDesc",
    promptTemplate:
      "Write an inspiring customer-facing announcement introducing {{feature_or_product}} to {{audience}}, emphasizing the problem solved and immediate benefits.",
  },

  // Analyze
  {
    id: "swot-analysis",
    category: "analyze",
    iconName: "Crosshair",
    mode: "text",
    titleKey: "swotTitle",
    descriptionKey: "swotDesc",
    promptTemplate:
      "Conduct a comprehensive SWOT analysis for {{company_or_project}} operating within the {{industry}} space. Highlight the most urgent strategic opportunities and vulnerabilities.",
  },
  {
    id: "tradeoff-matrix",
    category: "analyze",
    iconName: "Scale",
    mode: "text",
    titleKey: "tradeoffTitle",
    descriptionKey: "tradeoffDesc",
    promptTemplate:
      "Provide an objective architectural and operational trade-off comparison between {{option_a}} and {{option_b}} for {{use_case}}. Include criteria, weighted scores, and a clear recommendation.",
  },
  {
    id: "data-interpretation",
    category: "analyze",
    iconName: "LineChart",
    mode: "text",
    titleKey: "dataInsightsTitle",
    descriptionKey: "dataInsightsDesc",
    promptTemplate:
      "Analyze the following data points or metrics. Identify anomalies, meaningful trends, and 3 actionable tactical recommendations:\n\n{{data}}",
  },

  // Research
  {
    id: "market-landscape",
    category: "research",
    iconName: "Compass",
    mode: "text",
    titleKey: "marketLandscapeTitle",
    descriptionKey: "marketLandscapeDesc",
    promptTemplate:
      "Provide an authoritative research breakdown of the {{industry_or_domain}} market landscape. Detail market size, key incumbent players, disruptive startups, and regulatory tailwinds.",
  },
  {
    id: "literature-synthesis",
    category: "research",
    iconName: "BookOpen",
    mode: "text",
    titleKey: "litSynthesisTitle",
    descriptionKey: "litSynthesisDesc",
    promptTemplate:
      "Synthesize current academic and industry findings on {{subject_or_technology}}. Highlight areas of established consensus, ongoing debates, and open research questions.",
  },
  {
    id: "competitor-teardown",
    category: "research",
    iconName: "Building2",
    mode: "text",
    titleKey: "competitorTeardownTitle",
    descriptionKey: "competitorTeardownDesc",
    promptTemplate:
      "Perform a deep-dive competitive teardown on {{competitor_name}}. Detail their value proposition, product architecture, pricing model, and competitive moat.",
  },

  // Code
  {
    id: "code-refactor",
    category: "code",
    iconName: "Wrench",
    mode: "text",
    titleKey: "refactorTitle",
    descriptionKey: "refactorDesc",
    promptTemplate:
      "Refactor the following code to improve computational efficiency, readability, and idiomatic maintainability:\n\n```{{language}}\n{{code}}\n```",
  },
  {
    id: "unit-tests",
    category: "code",
    iconName: "CheckCircle2",
    mode: "text",
    titleKey: "unitTestsTitle",
    descriptionKey: "unitTestsDesc",
    promptTemplate:
      "Generate a comprehensive, production-grade test suite using {{test_framework}} for the following function, including edge cases and failure modes:\n\n```{{language}}\n{{code}}\n```",
  },
  {
    id: "api-design",
    category: "code",
    iconName: "Network",
    mode: "text",
    titleKey: "apiDesignTitle",
    descriptionKey: "apiDesignDesc",
    promptTemplate:
      "Design an elegant, secure REST API specification for {{feature_name}}. Include request/response payloads, error structures, idempotency considerations, and HTTP status codes.",
  },

  // Plan
  {
    id: "sprint-plan",
    category: "plan",
    iconName: "Layers",
    mode: "text",
    titleKey: "sprintPlanTitle",
    descriptionKey: "sprintPlanDesc",
    promptTemplate:
      "Create a detailed 2-week agile sprint plan to accomplish {{project_goal}}. Break down deliverables into epics, user stories, acceptance criteria, and time estimates.",
  },
  {
    id: "launch-checklist",
    category: "plan",
    iconName: "Rocket",
    mode: "text",
    titleKey: "launchChecklistTitle",
    descriptionKey: "launchChecklistDesc",
    promptTemplate:
      "Generate an end-to-end launch checklist for releasing {{product_or_feature}} to production. Include pre-launch verifications, rollback triggers, monitoring dashboards, and internal communications.",
  },
  {
    id: "quarterly-roadmap",
    category: "plan",
    iconName: "Milestone",
    mode: "text",
    titleKey: "roadmapTitle",
    descriptionKey: "roadmapDesc",
    promptTemplate:
      "Draft a strategic quarterly product roadmap for {{product_area}} structured across Now (committed), Next (discovery), and Later (future bets) horizons.",
  },

  // Learn
  {
    id: "explain-eli5",
    category: "learn",
    iconName: "Sparkles",
    mode: "text",
    titleKey: "eli5Title",
    descriptionKey: "eli5Desc",
    promptTemplate:
      "Explain the complex concept of {{complex_concept}} in intuitive, jargon-free language as if to a curious newcomer, using a memorable real-world analogy.",
  },
  {
    id: "knowledge-quiz",
    category: "learn",
    iconName: "HelpCircle",
    mode: "text",
    titleKey: "quizTitle",
    descriptionKey: "quizDesc",
    promptTemplate:
      "Create an interactive 5-question active recall test to evaluate deep conceptual understanding of {{topic}}. Include questions, answers, and brief explanations.",
  },
  {
    id: "mastery-curriculum",
    category: "learn",
    iconName: "GraduationCap",
    mode: "text",
    titleKey: "curriculumTitle",
    descriptionKey: "curriculumDesc",
    promptTemplate:
      "Design a rigorous 4-week self-study curriculum to master {{skill_or_subject}}. Provide weekly themes, foundational readings, and hands-on capstone exercises.",
  },

  // Image
  {
    id: "studio-portrait",
    category: "image",
    iconName: "Camera",
    mode: "image",
    titleKey: "portraitTitle",
    descriptionKey: "portraitDesc",
    promptTemplate:
      "Cinematic studio portrait of {{subject}}, 85mm lens, f/1.4 aperture, subtle rim lighting, high textural detail, award-winning photography, photorealistic.",
  },
  {
    id: "vector-logo",
    category: "image",
    iconName: "Palette",
    mode: "image",
    titleKey: "vectorLogoTitle",
    descriptionKey: "vectorLogoDesc",
    promptTemplate:
      "Modern minimalist vector logo mark for {{brand_or_concept}}, clean geometric balance, solid monochrome lines, flat design, white background.",
  },
  {
    id: "concept-art",
    category: "image",
    iconName: "Image",
    mode: "image",
    titleKey: "conceptArtTitle",
    descriptionKey: "conceptArtDesc",
    promptTemplate:
      "Atmospheric sci-fi concept art of {{setting_or_scene}}, expansive scale, volumetric fog, moody directional illumination, intricate environmental detail, 8k resolution.",
  },
];
