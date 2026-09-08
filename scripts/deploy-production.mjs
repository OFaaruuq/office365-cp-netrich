#!/usr/bin/env node
/**
 * Production deployment script — netrichtechnologies Microsoft 365 Control Panel
 *
 * Domain: https://office365.cp.netrichtechnologies.com
 *
 * Examples:
 *   node scripts/deploy-production.mjs --check
 *   node scripts/deploy-production.mjs --build
 *   node scripts/deploy-production.mjs --docker
 *   node scripts/deploy-production.mjs --docker --with-backend
 *   node scripts/deploy-production.mjs --build --start
 *   node scripts/deploy-production.mjs --full
 *
 * Env file: .env.production (copied from .env.production.example)
 */
import { spawnSync, spawn } from "child_process";
import {
  existsSync,
  readFileSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  accessSync,
  constants as fsConstants,
} from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash, randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.production");
const ENV_EXAMPLE = path.join(ROOT, ".env.production.example");
const PROD_DOMAIN = "office365.cp.netrichtechnologies.com";

const args = new Set(process.argv.slice(2));
const FLAG = {
  check: args.has("--check"),
  build: args.has("--build") || args.has("--full"),
  start: args.has("--start") || args.has("--full"),
  docker: args.has("--docker") || args.has("--full-docker"),
  withBackend: args.has("--with-backend"),
  skipInstall: args.has("--skip-install"),
  generateSecret: args.has("--generate-secret"),
  help: args.has("--help") || args.has("-h"),
};

function log(msg) {
  console.log(`[deploy] ${msg}`);
}
function fail(msg, code = 1) {
  console.error(`[deploy:error] ${msg}`);
  process.exit(code);
}
function ok(msg) {
  console.log(`[deploy:ok] ${msg}`);
}

function run(cmd, cmdArgs, opts = {}) {
  log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
    ...opts,
  });
  if (r.status !== 0) fail(`Command failed (${r.status}): ${cmd} ${cmdArgs.join(" ")}`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyEnv(env) {
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}

function printHelp() {
  console.log(`
netrichtechnologies — production deploy

Usage:
  node scripts/deploy-production.mjs [flags]

Flags:
  --check              Validate .env.production (required secrets, NODE_ENV)
  --generate-secret    Print a strong PORTAL_SESSION_SECRET and exit
  --build              npm ci + production build
  --start              Start Next.js with next start (after build)
  --docker             Build & run via docker-compose.prod.yml
  --with-backend       Include Nest API + Postgres + Redis (docker profile)
  --full               --check --build --start
  --full-docker        --check --docker
  --skip-install       Skip npm ci during --build
  --help               Show this help

First-time:
  1. cp .env.production.example .env.production
  2. Set PORTAL_SESSION_SECRET (≥32 chars) and Entra client ID
  3. node scripts/deploy-production.mjs --check
  4. node scripts/deploy-production.mjs --docker
     OR node scripts/deploy-production.mjs --full

Production URL: https://${PROD_DOMAIN}
`);
}

function ensureEnvFile() {
  if (!existsSync(ENV_FILE)) {
    if (!existsSync(ENV_EXAMPLE)) fail(`Missing ${ENV_EXAMPLE}`);
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
    log(`Created ${ENV_FILE} from example — edit secrets before deploying.`);
  }
}

function validateProductionEnv(env) {
  const errors = [];
  const warnings = [];

  const secret = env.PORTAL_SESSION_SECRET || "";
  if (!secret || secret.length < 32) {
    errors.push("PORTAL_SESSION_SECRET must be set and ≥32 characters");
  }
  if (secret === "netrich-office365-dev-session-secret-change-me") {
    errors.push("PORTAL_SESSION_SECRET is still the insecure default — generate a new one");
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL || "";
  if (!appUrl.startsWith("https://") && process.env.ALLOW_HTTP_PROD !== "true") {
    warnings.push(
      `NEXT_PUBLIC_APP_URL should be https:// in production (got: ${appUrl || "(empty)"})`
    );
  }
  if (appUrl && !appUrl.includes(PROD_DOMAIN) && !appUrl.includes("localhost")) {
    warnings.push(`NEXT_PUBLIC_APP_URL does not match ${PROD_DOMAIN}`);
  }

  if (!env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID) {
    warnings.push(
      "NEXT_PUBLIC_AZURE_AD_CLIENT_ID is empty — Entra SSO will be unavailable (demo login should stay off)"
    );
  }

  if (env.ALLOW_DEMO_LOGIN === "true") {
    warnings.push(
      "ALLOW_DEMO_LOGIN=true — credential/TOTP demo login is enabled (not recommended for real production)"
    );
  }

  if (env.NODE_ENV && env.NODE_ENV !== "production") {
    warnings.push(`NODE_ENV is "${env.NODE_ENV}" (expected production)`);
  }

  return { errors, warnings };
}

function checkPhase() {
  ensureEnvFile();
  const env = loadEnvFile(ENV_FILE);
  applyEnv(env);
  const { errors, warnings } = validateProductionEnv({ ...env, ...process.env });

  for (const w of warnings) console.warn(`[deploy:warn] ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[deploy:error] ${e}`);
    fail("Production env check failed. Fix .env.production and re-run --check.");
  }
  ok("Production environment looks valid");
  log(`App URL: ${process.env.NEXT_PUBLIC_APP_URL || "(unset)"}`);
  log(`Domain:  ${process.env.NEXT_PUBLIC_APP_DOMAIN || PROD_DOMAIN}`);
}

function generateSecret() {
  const secret = randomBytes(48).toString("base64url");
  console.log(secret);
  log("Copy into .env.production as PORTAL_SESSION_SECRET=...");
  log(`Checksum (sha256 prefix): ${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`);
}

function buildPhase() {
  ensureEnvFile();
  const env = loadEnvFile(ENV_FILE);
  applyEnv(env);
  process.env.NODE_ENV = "production";

  const { errors } = validateProductionEnv({ ...env, ...process.env });
  if (errors.length) {
    for (const e of errors) console.error(`[deploy:error] ${e}`);
    fail("Fix env before build (or run --check).");
  }

  if (!FLAG.skipInstall) {
    const lock = existsSync(path.join(ROOT, "package-lock.json"));
    run("npm", lock ? ["ci"] : ["install"]);
  }

  mkdirSync(path.join(ROOT, ".data"), { recursive: true });
  run("npm", ["run", "build"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  ok("Production build complete (.next)");
}

function startPhase() {
  ensureEnvFile();
  const env = loadEnvFile(ENV_FILE);
  applyEnv(env);
  process.env.NODE_ENV = "production";

  if (!existsSync(path.join(ROOT, ".next"))) {
    fail("No .next build found. Run with --build first.");
  }

  const port = process.env.PORT || "3000";
  log(`Starting production server on port ${port}…`);
  log(`Public URL: ${process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`}`);

  // Persist a tiny deploy marker for ops
  try {
    mkdirSync(path.join(ROOT, ".data"), { recursive: true });
    writeFileSync(
      path.join(ROOT, ".data", "last-deploy.json"),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          domain: PROD_DOMAIN,
          node: process.version,
          mode: "next-start",
        },
        null,
        2
      )
    );
  } catch {
    /* ignore */
  }

  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    },
  });

  child.on("exit", (code) => process.exit(code ?? 1));
}

function dockerPhase() {
  ensureEnvFile();
  const env = loadEnvFile(ENV_FILE);
  applyEnv(env);

  const { errors } = validateProductionEnv({ ...env, ...process.env });
  if (errors.length) {
    for (const e of errors) console.error(`[deploy:error] ${e}`);
    fail("Fix env before docker deploy.");
  }

  // Prefer `docker compose` (v2); fall back to docker-compose
  const composeFile = path.join(ROOT, "docker-compose.prod.yml");
  if (!existsSync(composeFile)) fail("docker-compose.prod.yml missing");

  const baseArgs = ["compose", "-f", "docker-compose.prod.yml", "--env-file", ".env.production"];
  if (FLAG.withBackend) baseArgs.push("--profile", "backend");

  // Probe docker
  const probe = spawnSync("docker", ["version"], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (probe.status !== 0) fail("Docker is not available. Install Docker Desktop / Engine.");

  run("docker", [...baseArgs, "up", "-d", "--build"]);
  ok("Docker stack is up");
  log("UI container: nt-office365-web");
  log(`Open: ${process.env.NEXT_PUBLIC_APP_URL || `https://${PROD_DOMAIN}`}`);
  if (FLAG.withBackend) {
    log("Backend profile enabled — API on :8080 (csp-api)");
  }
  log("Logs: docker compose -f docker-compose.prod.yml logs -f web");
}

function main() {
  if (FLAG.help || args.size === 0) {
    printHelp();
    if (args.size === 0) process.exit(0);
    return;
  }

  process.chdir(ROOT);

  if (FLAG.generateSecret) {
    generateSecret();
    return;
  }

  if (FLAG.check || FLAG.build || FLAG.start || FLAG.docker) {
    // always validate when deploying
  }

  if (FLAG.check && !FLAG.build && !FLAG.start && !FLAG.docker) {
    checkPhase();
    return;
  }

  if (FLAG.docker) {
    checkPhase();
    dockerPhase();
    return;
  }

  if (FLAG.build || FLAG.start) {
    checkPhase();
  }
  if (FLAG.build) buildPhase();
  if (FLAG.start) startPhase();
}

main();
