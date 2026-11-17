import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MarketingHero } from "@/components/marketing/hero";
import {
  HERO_SCENES,
  HERO_SCENE_DEFINITIONS,
} from "@/lib/marketing/hero-scenes";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path
    .split(".")
    .reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

let currentMessages: any = enMessages;

jest.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const fn = (key: string, values?: Record<string, any>) => {
      let resolved: any;
      if (namespace) {
        resolved = getNestedValue(currentMessages, `${namespace}.${key}`);
      }
      if (resolved === undefined) {
        resolved = getNestedValue(currentMessages, key);
      }
      if (resolved === undefined) {
        resolved = key;
      }
      if (typeof resolved === "string" && values) {
        Object.entries(values).forEach(([k, v]) => {
          resolved = resolved.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return resolved;
    };
    fn.raw = (key: string) => {
      if (namespace) {
        return getNestedValue(currentMessages, `${namespace}.${key}`);
      }
      return getNestedValue(currentMessages, key);
    };
    return fn;
  },
  useLocale: () => "en",
}));

/** The visible scene (inactive scenes are aria-hidden, so getByRole skips them). */
const panel = () => within(screen.getByRole("tabpanel"));

describe("Step F5.3 — Dynamic landing hero across fields", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    jest.useFakeTimers();
    currentMessages = enMessages;
    originalMatchMedia = window.matchMedia;

    // Default mock: standard motion (reduced motion: false)
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it("renders 6 scene tabs with role='tablist' and initial 'software' scene", () => {
    render(<MarketingHero />);

    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);

    // Initial selected tab is software
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();
    expect(
      screen.getByText(/klecx\/workspaces\/ws_arch_01/i)
    ).toBeInTheDocument();
    expect(
      panel().getByText(/pool_mode = transaction \| max_client_conn = 10000/i)
    ).toBeInTheDocument();
  });

  it("auto-rotates through scenes every 7 seconds", () => {
    render(<MarketingHero />);

    // Initially at software
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Advance 7 seconds
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    // Fast-forward fade transition
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Second scene: finance
    expect(panel().getByText("Household Budget 2027")).toBeInTheDocument();
    expect(
      screen.getByText(/klecx\/workspaces\/ws_fin_02/i)
    ).toBeInTheDocument();
    expect(panel().getByText(/Needs \(50%\)/i)).toBeInTheDocument();

    // Advance another 7 seconds
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Third scene: construction
    expect(panel().getByText("Duplex Build — Phase 1")).toBeInTheDocument();
    expect(
      screen.getByText(/klecx\/workspaces\/ws_bld_03/i)
    ).toBeInTheDocument();
  });

  it("pauses auto-rotation on mouse hover and resumes when mouse leaves", () => {
    render(<MarketingHero />);

    const previewPanel = screen.getByTestId("hero-scenes");
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Hover over preview
    fireEvent.mouseEnter(previewPanel);

    // Advance 14 seconds while hovered
    act(() => {
      jest.advanceTimersByTime(14000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Should NOT have changed scene
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Mouse leaves
    fireEvent.mouseLeave(previewPanel);

    // Advance 7 seconds
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Should have advanced to finance
    expect(panel().getByText("Household Budget 2027")).toBeInTheDocument();
  });

  it("pauses auto-rotation on focus and resumes on blur", () => {
    render(<MarketingHero />);

    const previewPanel = screen.getByTestId("hero-scenes");
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Focus inside preview
    fireEvent.focus(previewPanel);

    // Advance 14 seconds while focused
    act(() => {
      jest.advanceTimersByTime(14000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Scene should not change
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Blur focus
    fireEvent.blur(previewPanel);

    act(() => {
      jest.advanceTimersByTime(7000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(panel().getByText("Household Budget 2027")).toBeInTheDocument();
  });

  it("does not auto-rotate when prefers-reduced-motion is enabled", () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    render(<MarketingHero />);

    expect(panel().getByText("Database Architecture")).toBeInTheDocument();

    // Advance 30 seconds
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    // Still on software scene
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();
  });

  it("allows switching scenes directly by clicking on scene tab chips", () => {
    render(<MarketingHero />);

    const educationTab = screen.getByRole("tab", { name: /education/i });
    fireEvent.click(educationTab);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(panel().getByText("Biology Exam Prep")).toBeInTheDocument();
    expect(
      screen.getByText(/klecx\/workspaces\/ws_bio_05/i)
    ).toBeInTheDocument();
    expect(panel().getByText(/Days 1–4:/i)).toBeInTheDocument();
    expect(educationTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders all 6 scenes correctly in Spanish without errors", () => {
    currentMessages = esMessages;
    const { unmount } = render(<MarketingHero />);

    for (const sceneKey of HERO_SCENES) {
      const def = HERO_SCENE_DEFINITIONS[sceneKey];
      const tab = screen.getByRole("tab", {
        name: new RegExp(esMessages.Marketing.hero.scenes[sceneKey].label, "i"),
      });
      fireEvent.click(tab);
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(
        panel().getByText(
          esMessages.Marketing.hero.scenes[sceneKey].activeProject
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`klecx/workspaces/${def.slug}`, "i"))
      ).toBeInTheDocument();
    }

    unmount();
  });

  it("renders all 6 scenes correctly in French without errors", () => {
    currentMessages = frMessages;
    const { unmount } = render(<MarketingHero />);

    for (const sceneKey of HERO_SCENES) {
      const def = HERO_SCENE_DEFINITIONS[sceneKey];
      const tab = screen.getByRole("tab", {
        name: new RegExp(frMessages.Marketing.hero.scenes[sceneKey].label, "i"),
      });
      fireEvent.click(tab);
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(
        panel().getByText(
          frMessages.Marketing.hero.scenes[sceneKey].activeProject
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`klecx/workspaces/${def.slug}`, "i"))
      ).toBeInTheDocument();
    }

    unmount();
  });

  it("pauses while a scene chip has keyboard focus", () => {
    render(<MarketingHero />);
    fireEvent.focus(screen.getAllByRole("tab")[0]!);
    act(() => {
      jest.advanceTimersByTime(21000);
    });
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();
  });

  it("moves between scenes with the arrow keys (roving tabindex)", () => {
    render(<MarketingHero />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    expect(panel().getByText("Household Budget 2027")).toBeInTheDocument();

    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(tabs[5]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[5]!, { key: "ArrowRight" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("does not rotate while the browser tab is hidden", () => {
    const spy = jest
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    render(<MarketingHero />);
    act(() => {
      jest.advanceTimersByTime(21000);
    });
    expect(panel().getByText("Database Architecture")).toBeInTheDocument();
    spy.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(panel().getByText("Household Budget 2027")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders every scene in the same grid cell so rotation causes no layout shift", () => {
    const { container } = render(<MarketingHero />);
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(HERO_SCENES.length);
    const parents = new Set(Array.from(panels).map((p) => p.parentElement));
    expect(parents.size).toBe(1);
    panels.forEach((p) => expect(p.className).toContain("row-start-1"));
    // only the active scene is exposed to assistive tech and focusable
    expect(
      Array.from(panels).filter((p) => p.getAttribute("aria-hidden") !== "true")
    ).toHaveLength(1);
  });
});
