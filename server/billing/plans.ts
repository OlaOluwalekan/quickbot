/**
 * Klecx Billing Plans & Entitlements Source of Truth (§4.4)
 * Both client marketing pages and server enforcement import from here.
 */

export interface PlanLimits {
  attachmentsPerWorkspace: number;
  maxFileMB: number;
  members: number;
  exportFormats: ("md" | "pdf" | "docx")[];
  grounding: boolean;
  images: boolean;
}

export interface PlanDefinition {
  id: "FREE" | "LITE" | "STANDARD" | "PRO";
  name: string;
  badge?: string;
  popular?: boolean;
  tagline: string;
  priceMonthly: number;
  priceYearly: number; // Includes 2 months free
  credits: number;
  dailyCapCredits?: number;
  dailyCapPct?: number;
  maxConcurrent: number;
  models: string[];
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<"FREE" | "LITE" | "STANDARD" | "PRO", PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "Explore the workspace model with essential capabilities.",
    priceMonthly: 0,
    priceYearly: 0,
    credits: 100,
    dailyCapCredits: 30,
    maxConcurrent: 1,
    models: ["text-economy"],
    limits: {
      attachmentsPerWorkspace: 3,
      maxFileMB: 5,
      members: 0,
      exportFormats: ["md"],
      grounding: false,
      images: false,
    },
    features: [
      "100 credits / month (no rollover)",
      "Daily spend cap of 30 credits",
      "1 concurrent generation turn",
      "Economy model access",
      "3 attachments per workspace (5 MB max)",
      "Markdown document export",
      "Read-only workspace & response sharing",
    ],
  },
  LITE: {
    id: "LITE",
    name: "Lite",
    tagline: "For individual builders and researchers working daily.",
    priceMonthly: 4.99,
    priceYearly: 49,
    credits: 800,
    dailyCapPct: 0.25,
    maxConcurrent: 2,
    models: ["text-economy", "text-standard", "image-standard"],
    limits: {
      attachmentsPerWorkspace: 10,
      maxFileMB: 15,
      members: 2,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
    },
    features: [
      "800 credits / month (no rollover)",
      "Daily spend cap: 25% of monthly balance",
      "2 concurrent generation turns",
      "Economy & Standard text models",
      "Native AI image generation",
      "Web-search grounding support",
      "10 attachments per workspace (15 MB max)",
      "Up to 2 workspace collaborators",
      "Markdown, PDF & Word exports",
    ],
  },
  STANDARD: {
    id: "STANDARD",
    name: "Standard",
    badge: "Most Popular",
    popular: true,
    tagline: "Our recommended plan for power users and small teams.",
    priceMonthly: 9.99,
    priceYearly: 99,
    credits: 1800,
    dailyCapPct: 0.25,
    maxConcurrent: 3,
    models: ["text-economy", "text-standard", "image-standard"],
    limits: {
      attachmentsPerWorkspace: 25,
      maxFileMB: 25,
      members: 5,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
    },
    features: [
      "1,800 credits / month (no rollover)",
      "Daily spend cap: 25% of monthly balance",
      "3 concurrent generation turns",
      "Economy & Standard text models",
      "Native AI image generation",
      "Web-search grounding support",
      "25 attachments per workspace (25 MB max)",
      "Up to 5 workspace collaborators",
      "Full export suite (MD, PDF, DOCX)",
      "Priority customer support",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "Maximum throughput, highest limits, and team collaboration.",
    priceMonthly: 16.99,
    priceYearly: 169,
    credits: 3500,
    dailyCapPct: 0.2,
    maxConcurrent: 5,
    models: ["text-economy", "text-standard", "image-standard", "text-advanced"],
    limits: {
      attachmentsPerWorkspace: 50,
      maxFileMB: 50,
      members: 15,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
    },
    features: [
      "3,500 credits / month (no rollover)",
      "Daily spend cap: 20% of monthly balance",
      "5 concurrent generation turns",
      "All models including future advanced tiers",
      "Native AI image generation",
      "Web-search grounding support",
      "50 attachments per workspace (50 MB max)",
      "Up to 15 workspace collaborators",
      "Full export suite (MD, PDF, DOCX)",
      "Activity audit trail & role management",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/**
 * Frequently Asked Questions for pricing & marketing pages
 */
export interface FAQItem {
  question: string;
  answer: string;
}

export const BILLING_FAQ: FAQItem[] = [
  {
    question: "What is a credit and how does it work?",
    answer:
      "Credits represent units of computational work. A standard conversational prompt and response typically consumes around 7 credits. Image generation requires approximately 35 credits, and web-grounded search adds a small surcharge (+3 credits). We charge based on what provider models cost to run, with zero markup tricks.",
  },
  {
    question: "Do unused credits roll over to the next month?",
    answer:
      "No. Monthly plan credits expire and reset at the beginning of each billing cycle to maintain sustainable, transparent unit economics. If you ever purchase optional credit top-up packs in the future, those remain valid for 12 months.",
  },
  {
    question: "Can I cancel my subscription inside the app?",
    answer:
      "Yes. You can cancel at any time directly in your Account Settings with a single click. There are no retention labyrinths or phone calls required. Upon cancellation, your plan remains active until the end of your current paid billing period.",
  },
  {
    question: "What is your refund policy?",
    answer:
      "If you are unsatisfied with your subscription within the first 14 days of purchase and have used less than 20% of your monthly credit allowance, contact support for a prompt refund. Unused portions of that cycle's credit grant are reversed.",
  },
  {
    question: "Which AI models power Klecx?",
    answer:
      "Klecx is an independent interface built on top of high-performance third-party AI models (currently Google Gemini Flash-class models for low-latency reasoning and specialized image synthesis). We clearly label each model key and never hide what runs your requests.",
  },
  {
    question: "Is my conversation data kept private?",
    answer:
      "Yes. Your prompts, responses, notes, and workspace files are private by default. All data is encrypted in transit and at rest. We do not sell your personal data or use your private conversations to train public models.",
  },
];
