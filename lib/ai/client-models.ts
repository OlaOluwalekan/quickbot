export interface ClientModelOption {
  key: string;
  name: string;
  kind: "TEXT" | "IMAGE";
  minPlan: "FREE" | "LITE" | "STANDARD" | "PRO";
  creditHint: string;
  supportsThinking?: boolean;
}

export const CLIENT_MODELS: ClientModelOption[] = [
  {
    key: "text-economy",
    name: "Fast & Efficient",
    kind: "TEXT",
    minPlan: "FREE",
    creditHint: "1 credit",
    supportsThinking: true,
  },
  {
    key: "text-standard",
    name: "Standard Reasoning",
    kind: "TEXT",
    minPlan: "LITE",
    creditHint: "2 credits",
    supportsThinking: true,
  },
];

export const CLIENT_IMAGE_MODELS: ClientModelOption[] = [
  {
    key: "image-standard",
    name: "Image Studio",
    kind: "IMAGE",
    minPlan: "LITE",
    creditHint: "34 credits",
    supportsThinking: false,
  },
];
