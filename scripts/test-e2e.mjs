import { execFileSync, spawnSync } from "node:child_process";

const status = execFileSync("supabase", ["status", "--output", "env"], {
  encoding: "utf8",
});
const appOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const values = Object.fromEntries(
  [...status.matchAll(/^([A-Z_]+)="([^"]*)"$/gm)].map(([, key, value]) => [
    key,
    value,
  ]),
);

if (!values.API_URL || !values.PUBLISHABLE_KEY || !values.SECRET_KEY) {
  throw new Error("Local Supabase must be running before browser tests.");
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(values.API_URL)) {
  throw new Error("Browser tests only accept a local Supabase API URL.");
}

const result = spawnSync("playwright", ["test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    E2E_SUPABASE_URL: values.API_URL,
    E2E_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    E2E_SUPABASE_SECRET_KEY: values.SECRET_KEY,
    E2E_APP_ORIGIN: appOrigin,
    NEXT_PUBLIC_APP_ORIGIN: appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: values.SECRET_KEY,
  },
});

process.exit(result.status ?? 1);
