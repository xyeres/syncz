import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Per-project options shared by every project (next/jest adds the SWC transform,
// module name mappers and ignore patterns on top of these).
const projectConfig: Config = {
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

// Two projects so the domain never sees DOM globals:
//  - "domain": src/domain/** runs in the plain `node` environment (no window/document).
//  - "core":   src/application/** and src/infrastructure/** (node), use cases on in-memory ports.
//  - "ui":     everything else keeps the jsdom environment for future UI tests.
// createJestConfig is async (it loads next.config), so the projects are built from its result.
export default async function jestConfig(): Promise<Config> {
  const base = await createJestConfig(projectConfig)();
  return {
    coverageProvider: "v8",
    projects: [
      {
        ...base,
        displayName: "domain",
        testEnvironment: "node",
        testMatch: ["<rootDir>/src/domain/**/*.test.ts"],
      },
      {
        ...base,
        displayName: "core",
        testEnvironment: "node",
        testMatch: ["<rootDir>/src/application/**/*.test.ts", "<rootDir>/src/infrastructure/**/*.test.ts"],
      },
      {
        ...base,
        displayName: "ui",
        testEnvironment: "jsdom",
        testPathIgnorePatterns: [
          ...(base.testPathIgnorePatterns ?? []),
          "<rootDir>/src/domain/",
          "<rootDir>/src/application/",
          "<rootDir>/src/infrastructure/",
        ],
      },
    ],
  };
}
