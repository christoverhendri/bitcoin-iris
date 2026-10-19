import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Test fixtures (frozen notebook output, saved pages) are for tests only: runtime
// code computes from live data (IRIS_koreksi_auto_compute.md §0.5).
const FIXTURES = {
  group: ["**/__fixtures__/**", "**/fixtures/*.json"],
  message: "Fixtures are test-only. Runtime code must compute from live data, never read a frozen file.",
};
const TESTS = ["**/*.test.ts", "**/*.test.tsx", "**/__fixtures__/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: { "no-restricted-imports": ["error", { patterns: [FIXTURES] }] },
  },
  {
    // The mock contract, enforced rather than merely documented.
    //
    // A component must receive its data as an `Envelope<T>` from a feature's
    // `index.ts`, never by importing `live.ts` or `mock.ts` directly — the
    // envelope is what carries the `isMock` flag that renders the badge, so a
    // direct import is the one way synthetic data could reach a pixel unlabelled.
    //
    // Alias patterns only. A bare `./live` pattern would also fire inside the
    // feature directories, where those imports are the whole point.
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/features/*/live", "@/lib/features/*/mock"],
              message:
                "Import the feature's getter from its index.ts instead. Components receive an Envelope<T>, never a bare live/mock payload — that is what puts the MOCK badge on synthetic data.",
            },
            FIXTURES,
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "services/**/.venv*/**",
    ".local/**",
  ]),
]);

export default eslintConfig;
