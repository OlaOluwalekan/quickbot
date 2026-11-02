/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */
import nextJest from 'next/jest'

import type { Config } from 'jest'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  // All imported modules in your tests should be mocked automatically
  // automock: false,

  // Stop running tests after `n` failures
  // bail: 0,

  // The directory where Jest should store its cached dependency information
  // cacheDirectory: "C:\\Users\\wfson\\AppData\\Local\\Temp\\jest",

  // Automatically clear mock calls, instances, contexts and results before every test
  // clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  // collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  // collectCoverageFrom: undefined,

  // The directory where Jest should output its coverage files
  // coverageDirectory: 'coverage',

  // An array of regexp pattern strings used to skip coverage collection
  // coveragePathIgnorePatterns: [
  //   "\\\\node_modules\\\\"
  // ],

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // A list of reporter names that Jest uses when writing coverage reports
  // coverageReporters: [
  //   "json",
  //   "text",
  //   "lcov",
  //   "clover"
  // ],

  // An object that configures minimum threshold enforcement for coverage results
  // coverageThreshold: undefined,

  // A path to a custom dependency extractor
  // dependencyExtractor: undefined,

  // Make calling deprecated APIs throw helpful error messages
  // errorOnDeprecated: false,

  // The default configuration for fake timers
  // fakeTimers: {
  //   "enableGlobally": false
  // },

  // Force coverage collection from ignored files using an array of glob patterns
  // forceCoverageMatch: [],

  // A path to a module which exports an async function that is triggered once before all test suites
  // globalSetup: undefined,

  // A path to a module which exports an async function that is triggered once after all test suites
  // globalTeardown: undefined,

  // A set of global variables that need to be available in all test environments
  // globals: {},

  // The maximum amount of workers used to run your tests. Can be specified as % or a number. E.g. maxWorkers: 10% will use 10% of your CPU amount + 1 as the maximum worker number. maxWorkers: 2 will use a maximum of 2 workers.
  // maxWorkers: "50%",

  // An array of directory names to be searched recursively up from the requiring module's location
  // moduleDirectories: [
  //   "node_modules"
  // ],

  // An array of file extensions your modules use
  // moduleFileExtensions: [
  //   "js",
  //   "mjs",
  //   "cjs",
  //   "jsx",
  //   "ts",
  //   "tsx",
  //   "json",
  //   "node"
  // ],

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@prisma/client/runtime/(.*)\\.mjs$': '@prisma/client/runtime/$1.js',
  },

  // An array of regexp pattern strings, matched against all module paths before considered 'visible' to the module loader
  // modulePathIgnorePatterns: [],

  // Activates notifications for test results
  // notify: false,

  // An enum that specifies notification mode. Requires { notify: true }
  // notifyMode: "failure-change",

  // A preset that is used as a base for Jest's configuration
  preset: 'ts-jest',

  // Run tests from one or more projects
  // projects: undefined,

  // Use this configuration option to add custom reporters to Jest
  // reporters: undefined,

  // Automatically reset mock state before every test
  // resetMocks: false,

  // Reset the module registry before running each individual test
  // resetModules: false,

  // A path to a custom resolver
  // resolver: undefined,

  // Automatically restore mock state and implementation before every test
  // restoreMocks: false,

  // The root directory that Jest should scan for tests and modules within
  // rootDir: undefined,

  // A list of paths to directories that Jest should use to search for files in
  // roots: [
  //   "<rootDir>"
  // ],

  // Allows you to use a custom runner instead of Jest's default test runner
  // runner: "jest-runner",

  // The paths to modules that run some code to configure or set up the testing environment before each test
  // setupFiles: [],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // The number of seconds after which a test is considered as slow and reported as such in the results.
  // slowTestThreshold: 5,

  // A list of paths to snapshot serializer modules Jest should use for snapshot testing
  // snapshotSerializers: [],

  // The test environment that will be used for testing
  // testEnvironment: 'jsdom',
  testEnvironment: 'jsdom',

  // Options that will be passed to the testEnvironment
  // testEnvironmentOptions: {},

  // Adds a location field to test results
  // testLocationInResults: false,

  // The glob patterns Jest uses to detect test files
  // testMatch: [
  //   "**/__tests__/**/*.[jt]s?(x)",
  //   "**/?(*.)+(spec|test).[tj]s?(x)"
  // ],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  // testPathIgnorePatterns: [
  //   "\\\\node_modules\\\\"
  // ],

  // The regexp pattern or array of patterns that Jest uses to detect test files
  // testRegex: [],

  // This option allows the use of a custom results processor
  // testResultsProcessor: undefined,

  // This option allows use of a custom test runner
  // testRunner: "jest-circus/runner",

  // A map from regular expressions to paths to transformers
  // transform: undefined,

  // An array of regexp pattern strings that are matched against all source file paths, matched files will skip transformation
  // transformIgnorePatterns: [
  //   "\\\\node_modules\\\\",
  //   "\\.pnp\\.[^\\\\]+$"
  // ],

  // An array of regexp pattern strings that are matched against all modules before the module loader will automatically return a mock for them
  // unmockedModulePathPatterns: undefined,

  // Indicates whether each individual test should be reported during the run
  // verbose: undefined,

  // An array of regexp patterns that are matched against all source file paths before re-running tests in watch mode
  // watchPathIgnorePatterns: [],

  // Whether to use watchman for file crawling
  // watchman: true,
}

const esmPackages = '@adobe/css-tools|@better-auth/core|@better-auth/drizzle-adapter|@better-auth/kysely-adapter|@better-auth/memory-adapter|@better-auth/mongo-adapter|@better-auth/prisma-adapter|@better-auth/telemetry|@better-fetch/fetch|@electric-sql/pglite|@electric-sql/pglite-socket|@electric-sql/pglite-tools|@eloqnt/config|@eloqnt/format-json|@eloqnt/format-po|@eslint/config-array|@eslint/config-helpers|@eslint/core|@eslint/eslintrc|@eslint/object-schema|@eslint/plugin-kit|@formatjs/fast-memoize|@formatjs/icu-messageformat-parser|@formatjs/icu-skeleton-parser|@formatjs/intl-localematcher|@google/genai|@humanfs/core|@humanfs/node|@humanfs/types|@humanwhocodes/module-importer|@humanwhocodes/retry|@noble/ciphers|@noble/hashes|@prisma/dev|@prisma/streams-local|@prisma/studio-core|@schummar/icu-type-parser|@shikijs/core|@shikijs/engine-javascript|@shikijs/engine-oniguruma|@shikijs/langs|@shikijs/primitive|@shikijs/themes|@shikijs/types|@shikijs/vscode-textmate|@standard-schema/spec|@standard-schema/utils|@swc/helpers|@tanstack/query-core|@tanstack/react-query|@ungap/structured-clone|bail|baseline-browser-mapping|better-auth|better-call|better-result|c12|ccount|character-entities|character-entities-html4|character-entities-legacy|character-reference-invalid|chokidar|cliui|comma-separated-tokens|commander|confbox|d3-array|d3-color|d3-delaunay|d3-format|d3-geo|d3-interpolate|d3-path|d3-scale|d3-shape|d3-time|d3-time-format|data-uri-to-buffer|decode-named-character-reference|deepmerge-ts|delaunator|destr|devlop|entities|env-paths|escape-string-regexp|eslint-import-resolver-typescript|eslint-scope|eslint-visitor-keys|espree|estree-util-is-identifier-name|eventsource-parser|exsolve|fetch-blob|flatted|foreground-child|formdata-polyfill|get-package-type|get-tsconfig|giget|grammex|graphmatch|hast-util-from-dom|hast-util-parse-selector|hastscript|hast-util-from-html|hast-util-from-html-isomorphic|hast-util-from-parse5|hast-util-sanitize|hast-util-to-html|hast-util-to-jsx-runtime|hast-util-to-text|hast-util-whitespace|html-url-attributes|html-void-elements|icu-minify|internmap|intl-messageformat|is-alphabetical|is-alphanumerical|is-decimal|is-hexadecimal|is-plain-obj|jiti|jose|kysely|long|longest-streak|markdown-table|mdast-util-find-and-replace|mdast-util-from-markdown|mdast-util-gfm|mdast-util-gfm-autolink-literal|mdast-util-gfm-footnote|mdast-util-gfm-strikethrough|mdast-util-gfm-table|mdast-util-gfm-task-list-item|mdast-util-math|mdast-util-mdx-expression|mdast-util-mdx-jsx|mdast-util-mdxjs-esm|mdast-util-phrasing|mdast-util-to-hast|mdast-util-to-markdown|mdast-util-to-string|micromark|micromark-core-commonmark|micromark-extension-gfm|micromark-extension-gfm-autolink-literal|micromark-extension-gfm-footnote|micromark-extension-gfm-strikethrough|micromark-extension-gfm-table|micromark-extension-gfm-tagfilter|micromark-extension-gfm-task-list-item|micromark-extension-math|micromark-factory-destination|micromark-factory-label|micromark-factory-space|micromark-factory-title|micromark-factory-whitespace|micromark-util-character|micromark-util-chunked|micromark-util-classify-character|micromark-util-combine-extensions|micromark-util-decode-numeric-character-reference|micromark-util-decode-string|micromark-util-encode|micromark-util-html-tag-name|micromark-util-normalize-identifier|micromark-util-resolve-all|micromark-util-sanitize-uri|micromark-util-subtokenize|micromark-util-symbol|micromark-util-types|nanoid|async|non-secure|url-alphabet|nanostores|next-intl|node-fetch|node-releases|ohash|oniguruma-parser|oniguruma-to-es|parse-entities|parse5|pathe|perfect-debounce|po-parser|postal-mime|src|postgres|prettier-plugin-tailwindcss|property-information|psl|rc9|react-markdown|readdirp|regex|regex-recursion|regex-utilities|rehype-katex|rehype-sanitize|remark-gfm|remark-math|remark-parse|remark-rehype|remark-stringify|remeda|resolve-pkg-maps|robust-predicates|rou3|set-cookie-parser|shiki|space-separated-tokens|std-env|stringify-entities|tinyglobby|fdir|trim-lines|trough|ts-api-utils|modules|uncrypto|unified|unist-util-is|unist-util-position|unist-util-remove-position|unist-util-stringify-position|unist-util-visit|unist-util-visit-parents|use-intl|valibot|vfile|vfile-location|vfile-message|web-namespaces|y18n|yargs|yargs-parser|zeptomatch|zod|locales|mini|v3|v4|v4-mini|zwitch';

const createConfig = createJestConfig(config);

export default async function jestConfig() {
  const nextConfig = await createConfig();
  return {
    ...nextConfig,
    transformIgnorePatterns: [
      `[/\\\\]node_modules[/\\\\](?!.*(${esmPackages}))`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
}
