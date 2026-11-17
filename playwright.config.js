
process.env.PLAYWRIGHT_BROWSERS_PATH ||= "0";

const { defineConfig, devices } = await import("@playwright/test");
const { default: dotenv } = await import("dotenv");
const { readFileSync } = await import("node:fs");

const envResult = dotenv.config({ path: ".env.test" });

if (envResult.error) {
  throw new Error(
    "Cannot load .env.test. Check that it exists in the project root."
  );
}

const requiredVariables = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "TL_ID",
  "TL_PASSWORD",
];

const missingVariables = requiredVariables.filter(
  (name) => !process.env[name]
);

if (missingVariables.length) {
  throw new Error(
    `Missing environment variables in .env.test: ${missingVariables.join(", ")}`
  );
}

const appEnv = dotenv.parse(readFileSync(".env"));
if (
  process.env.VITE_FIREBASE_PROJECT_ID &&
  appEnv.VITE_FIREBASE_PROJECT_ID === process.env.VITE_FIREBASE_PROJECT_ID &&
  process.env.E2E_ALLOW_SHARED_FIREBASE_PROJECT !== "true"
) {
  throw new Error(
    "Playwright must use a separate Firebase test project. For a disposable project only, set E2E_ALLOW_SHARED_FIREBASE_PROJECT=true for this run.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",

  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: 0,

  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "teamleader",
      testMatch: "**/teamleader.spec.js",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin",
      testMatch: "**/admin.spec.js",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "multi-user",
      testMatch: "**/multi-user.spec.js",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
