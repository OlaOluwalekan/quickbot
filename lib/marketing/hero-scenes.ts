export const HERO_SCENES = [
  "software",
  "finance",
  "construction",
  "hobby",
  "education",
  "smallBusiness",
] as const;

/** Auto-rotation interval of the landing hero (F5.3). */
export const HERO_ROTATION_MS = 7000;

export type HeroSceneKey = (typeof HERO_SCENES)[number];

export type HeroArtifactType = "code" | "table" | "checklist" | "quote";

export interface HeroSceneDefinition {
  id: HeroSceneKey;
  slug: string;
  iconName:
    "Code2" | "TrendingUp" | "HardHat" | "ChefHat" | "GraduationCap" | "Store";
  artifactType: HeroArtifactType;
}

export const HERO_SCENE_DEFINITIONS: Record<HeroSceneKey, HeroSceneDefinition> =
  {
    software: {
      id: "software",
      slug: "ws_arch_01",
      iconName: "Code2",
      artifactType: "code",
    },
    finance: {
      id: "finance",
      slug: "ws_fin_02",
      iconName: "TrendingUp",
      artifactType: "table",
    },
    construction: {
      id: "construction",
      slug: "ws_bld_03",
      iconName: "HardHat",
      artifactType: "table",
    },
    hobby: {
      id: "hobby",
      slug: "ws_sd_04",
      iconName: "ChefHat",
      artifactType: "checklist",
    },
    education: {
      id: "education",
      slug: "ws_bio_05",
      iconName: "GraduationCap",
      artifactType: "checklist",
    },
    smallBusiness: {
      id: "smallBusiness",
      slug: "ws_cafe_06",
      iconName: "Store",
      artifactType: "checklist",
    },
  };
