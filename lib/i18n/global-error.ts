import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";

/**
 * Copy for `app/global-error.tsx`. That page replaces the root layout, so it
 * renders outside the next-intl provider and can't load `messages/*.json`
 * without shipping a whole message bundle to every page. The `Record<Locale, …>`
 * type keeps the three locales in step.
 */
export interface GlobalErrorCopy {
  title: string;
  description: string;
  errorRef: string;
  tryAgain: string;
  contactSupport: string;
}

export const GLOBAL_ERROR_COPY: Record<Locale, GlobalErrorCopy> = {
  en: {
    title: "Critical System Error",
    description: "An unexpected error interrupted the application. Your data is safe.",
    errorRef: "Error Reference: ",
    tryAgain: "Try again",
    contactSupport: "Contact Support",
  },
  es: {
    title: "Error crítico del sistema",
    description: "Un error inesperado interrumpió la aplicación. Tus datos están a salvo.",
    errorRef: "Referencia del error: ",
    tryAgain: "Intentar de nuevo",
    contactSupport: "Contactar a soporte",
  },
  fr: {
    title: "Erreur critique du système",
    description: "Une erreur inattendue a interrompu l'application. Vos données sont en sécurité.",
    errorRef: "Référence d'erreur : ",
    tryAgain: "Réessayer",
    contactSupport: "Contacter le support",
  },
};

function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** The locale chosen by cookie, then the browser language, then the default. */
export function resolveGlobalErrorLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];
  if (isLocale(cookie)) return cookie;
  const browser = typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : null;
  if (isLocale(browser)) return browser;
  return defaultLocale;
}
