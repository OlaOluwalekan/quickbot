import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import i18nextPlugin from "eslint-plugin-i18next";

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "server/db/generated/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-children-prop": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: [
      "app/dev/**",
      "app/api/**",
      "app/opengraph-image.tsx",
      "app/twitter-image.tsx",
      "**/*.test.{ts,tsx}",
      "**/__tests__/**",
    ],
    plugins: {
      i18next: i18nextPlugin,
    },
    rules: {
      // The JSX-only rule above can't see strings passed to toasts.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='toast'] > Literal.arguments:first-child[value=/[A-Za-z]/]",
          message: "Toast text must come from next-intl (messages/*.json).",
        },
        {
          selector:
            "CallExpression[callee.name='toast'] > Literal.arguments:first-child[value=/[A-Za-z]/]",
          message: "Toast text must come from next-intl (messages/*.json).",
        },
        {
          selector:
            "CallExpression[callee.object.name='toast'] > TemplateLiteral.arguments:first-child",
          message: "Toast text must come from next-intl (messages/*.json).",
        },
        {
          // setError("…"), setSubmitError("…"), setMessage("…")
          selector:
            "CallExpression[callee.name=/^set\\w*(Error|Message)$/] > Literal.arguments:first-child[value=/[A-Za-z]{2}/]",
          message: "User-visible text must come from next-intl (messages/*.json).",
        },
        {
          // setResponse({ message: "…" }) and similar status objects
          selector: "Property[key.name='message'] > Literal.value[value=/[A-Za-z]{2} /]",
          message: "User-visible text must come from next-intl (messages/*.json).",
        },
        {
          // Dates and numbers follow the app's locale, not the browser's.
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
          message:
            "Use next-intl's useFormatter() / getFormatter() so dates and numbers follow the app's locale.",
        },
        {
          // function Foo({ label = "Loading" }) — default text props
          selector:
            "ObjectPattern > Property > AssignmentPattern > Literal.right[value=/^[A-Z][a-z]+(\\s\\S+)*$/]",
          message: "Default text must come from next-intl (messages/*.json).",
        },
      ],
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            include: ["aria-label", "title", "placeholder", "alt", "label"],
          },
          words: {
            exclude: [
              "Klecx",
              "Ctrl",
              "Cmd",
              "K",
              "Enter",
              "Shift",
              "Esc",
              "Tab",
              "Markdown",
              "PDF",
              "DOCX",
              "JSON",
              "PNG",
              "JPG",
              "WEBP",
              "API",
              "URL",
              "ID",
              "UUID",
              "SSE",
              "GPS",
              "SMS",
              "USD",
              "EUR",
              "GBP",
              "NGN",
              "FAQ",
              "U",
              "cr",
              "cr/mo",
              "∞",
              "\\[",
              "\\*",
              "TRANSFER",
              "ADMIN",
              "EDITOR",
              "COMMENTER",
              "VIEWER",
              "OWNER",
              "none",
              "@",
              "/s/",
              "/",
              "·",
              "…",
              "•",
              "›",
              "“",
              "”",
              "«",
              "»",
              "—",
              "©",
              "→",
              "✕",
              "↵",
              "Kl",
              "cx",
              "01",
              "02",
              "03",
              "⌘K",
              "Ctrl K",
              "md",
              "pdf",
              "docx",
              "txt",
              "csv",
              "tsv",
            ],
          },
          callees: {
            exclude: [
              "t.*",
              "format.*",
              "roleLabel",
              "cn",
              "cva",
              "clsx",
            ],
          },
        },
      ],
    },
  },
  {
    files: [
      "components/marketing/**/*.{ts,tsx}",
      "components/help/**/*.{ts,tsx}",
      "app/(marketing)/**/*.{ts,tsx}",
    ],
    ignores: [
      "app/(marketing)/terms/**",
      "app/(marketing)/privacy/**",
      "app/(marketing)/acceptable-use/**",
      "app/(marketing)/cookies/**",
      "components/legal/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Please import Link from '@/i18n/navigation' instead of 'next/link'.",
            },
            {
              name: "next/navigation",
              importNames: ["useRouter", "usePathname", "redirect"],
              message: "Please import navigation helpers from '@/i18n/navigation'.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
