/**
 * @jest-environment node
 */

import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { NOTIFICATION_TYPES } from "@/lib/schemas/notification";

type Tree = { [key: string]: string | Tree };

function keyPaths(node: Tree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : keyPaths(value, `${prefix}${key}.`)
  );
}

describe("Fix F2.3 — notification texts are translated", () => {
  const locales: Record<string, Tree> = {
    en: en.Notifications,
    es: es.Notifications,
    fr: fr.Notifications,
  };

  it("has the same Notifications keys in en, es and fr", () => {
    const expected = keyPaths(locales.en!).sort();
    expect(keyPaths(locales.es!).sort()).toEqual(expected);
    expect(keyPaths(locales.fr!).sort()).toEqual(expected);
  });

  it.each(Object.keys(locales))(
    "%s has a title for every notification type",
    (locale) => {
      const items = locales[locale]!.items as Tree;
      for (const type of NOTIFICATION_TYPES) {
        const entry = items[type] as Tree | undefined;
        expect(typeof entry?.title).toBe("string");
      }
      expect(typeof (items.default as Tree).description).toBe("string");
    }
  );

  it("es and fr are not left in English", () => {
    const english = locales.en!.items as Tree;
    for (const locale of ["es", "fr"]) {
      const items = locales[locale]!.items as Tree;
      for (const type of NOTIFICATION_TYPES) {
        expect((items[type] as Tree).title).not.toBe(
          (english[type] as Tree).title
        );
      }
    }
  });
});
