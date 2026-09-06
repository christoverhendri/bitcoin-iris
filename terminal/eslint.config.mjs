import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
  ]),
]);

export default eslintConfig;
