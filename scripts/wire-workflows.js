/**
 * wire-workflows.js
 *
 * n8n assigns a fresh, random workflow ID every time a workflow is imported —
 * you can never hardcode it into a committed JSON file ahead of time. This
 * script removes that manual step: it imports/updates all 5 workflows via the
 * n8n public REST API, resolves the real ID of the
 * "Invo Match - Log Audit Event Sub-workflow", patches every
 * `executeWorkflow` node in the other workflows to point at that real ID,
 * and activates everything.
 *
 * It also auto-provisions IMAP and SMTP credentials from .env so you never
 * have to touch the n8n UI for credentials.
 * Credential IDs are cached back into .env (N8N_IMAP_CRED_ID / N8N_SMTP_CRED_ID)
 * so re-runs reuse the same credentials rather than creating duplicates.
 *
 * Prerequisites:
 *   1. n8n must be running (docker compose up -d).
 *   2. Create an n8n API key: Settings -> n8n API -> Create an API Key.
 *   3. Add it to .env as N8N_API_KEY=...
 *   4. All IMAP_* and SMTP_* values must be set in .env.
 *
 * Usage:
 *   node scripts/wire-workflows.js
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const ENV_PATH = path.resolve(".env");
const N8N_BASE_URL = process.env.N8N_BASE_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error("Missing N8N_API_KEY in .env.");
  console.error("Create one in n8n: Settings -> n8n API -> Create an API Key, then set N8N_API_KEY=... in .env");
  process.exit(1);
}

// Validate required credential env vars
const REQUIRED_VARS = [
  "IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"
];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`Missing required .env variables: ${missing.join(", ")}`);
  process.exit(1);
}

const WORKFLOW_FILES = [
  "log-audit-event.n8n.json",   // must be imported first — everything else references it
  "error-handler.n8n.json",
  "invo-match-main.n8n.json",
  "invo-match-manual-upload.n8n.json",
  "procurement-review-webhook.n8n.json"
];

// ─── .env write-back helper ───────────────────────────────────────────────────

/**
 * Write a key=value pair into .env. If the key already exists, updates it in-place.
 * If it doesn't exist, appends it.
 */
function writeEnvVar(key, value) {
  let content = fs.readFileSync(ENV_PATH, "utf8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, "utf8");
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiRequest(method, endpoint, body) {
  const res = await fetch(`${N8N_BASE_URL}/api/v1${endpoint}`, {
    method,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    throw new Error(`n8n API ${method} ${endpoint} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// ─── Credential provisioning ─────────────────────────────────────────────────

/**
 * Create a credential and return its real n8n ID.
 * The n8n public API only supports POST + DELETE on /credentials —
 * no list/get/patch. To avoid duplicates on re-runs, we cache the
 * resulting ID back into .env under the given envKey.
 */
async function provisionCredential(envKey, label, type, data) {
  // Reuse cached ID if it exists and hasn't been manually cleared
  const cached = process.env[envKey];
  if (cached) {
    console.log(`  - Reusing cached ${label} credential (${envKey}=${cached})`);
    return cached;
  }

  console.log(`  - Creating ${label} credential...`);
  const created = await apiRequest("POST", "/credentials", { name: label, type, data });
  const id = created.id;
  console.log(`  - Created ${label} credential (id=${id})`);

  // Persist ID so the next run skips re-creation
  writeEnvVar(envKey, id);
  console.log(`  - Saved ${envKey}=${id} to .env`);
  return id;
}

/**
 * Provision IMAP credential from .env and return its real n8n ID.
 */
async function provisionImap() {
  return provisionCredential("N8N_IMAP_CRED_ID", "IMAP Account", "imap", {
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10),
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    secure: true,
    allowUnauthorizedCerts: false
  });
}

/**
 * Provision SMTP credential from .env and return its real n8n ID.
 */
async function provisionSmtp() {
  const port = parseInt(process.env.SMTP_PORT, 10);
  return provisionCredential("N8N_SMTP_CRED_ID", "SMTP Credentials", "smtp", {
    host: process.env.SMTP_HOST,
    port,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    secure: port === 465,       // 465 = implicit TLS; 587 = STARTTLS
    disableStartTls: false      // required field for n8n SMTP schema
  });
}

// ─── Workflow helpers ─────────────────────────────────────────────────────────

async function findWorkflowByName(name) {
  const result = await apiRequest("GET", "/workflows?limit=250");
  return (result.data || []).find(w => w.name === name);
}

async function upsertWorkflow(filePath, imapCredentialId, smtpCredentialId) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Pre-patch credentials to avoid n8n API validation errors on create/update
  if (raw.nodes) {
    for (const node of raw.nodes) {
      if (smtpCredentialId && node.credentials?.smtp) {
        node.credentials.smtp.id = smtpCredentialId;
        node.credentials.smtp.name = "SMTP Credentials";
      }
      if (imapCredentialId && node.credentials?.imap) {
        node.credentials.imap.id = imapCredentialId;
        node.credentials.imap.name = "IMAP Account";
      }
    }
  }

  // Strip fields n8n's API rejects on create/update
  const allowedFields = ["name", "nodes", "connections", "settings"];
  const payload = {};
  for (const k of allowedFields) { if (raw[k] !== undefined) payload[k] = raw[k]; }

  const existing = await findWorkflowByName(raw.name);
  let saved;
  if (existing) {
    console.log(`Updating existing workflow "${raw.name}" (id=${existing.id})`);
    saved = await apiRequest("PUT", `/workflows/${existing.id}`, payload);
  } else {
    console.log(`Creating workflow "${raw.name}"`);
    saved = await apiRequest("POST", "/workflows", payload);
  }
  return saved;
}

/**
 * Patch a live workflow to fix:
 *   - executeWorkflow node workflowId references
 *   - SMTP credential IDs on emailSend nodes
 *   - IMAP credential IDs on emailReadImap nodes
 *   - errorWorkflow setting
 */
async function patchWorkflow(workflowId, {
  logAuditWorkflowId,
  errorHandlerWorkflowId,
  smtpCredentialId,
  imapCredentialId
}) {
  const wf = await apiRequest("GET", `/workflows/${workflowId}`);
  let changed = false;

  for (const node of wf.nodes) {
    // Patch executeWorkflow references
    // n8n's Execute Workflow node (typeVersion >= 1.2) requires workflowId to be a
    // resource-locator object, not a plain string. Writing a raw string here is what
    // caused "workflow is not registered" — the node silently falls back to a broken
    // webhook-based call mode instead of calling the sub-workflow by id.
    if (node.type === "n8n-nodes-base.executeWorkflow") {
      const currentValue = node.parameters?.workflowId?.value;
      if (currentValue !== logAuditWorkflowId) {
        node.parameters.workflowId = {
          __rl: true,
          value: logAuditWorkflowId,
          mode: "list",
          cachedResultName: "Invo Match - Log Audit Event Sub-workflow"
        };
        node.parameters.workflowInputs = node.parameters.workflowInputs || {
          mappingMode: "defineBelow",
          value: {}
        };
        node.parameters.options = node.parameters.options || {};
        node.typeVersion = 1.3;
        changed = true;
        console.log(`  - Patched executeWorkflow "${node.name}" -> workflowId=${logAuditWorkflowId}`);
      }
    }

    // Patch SMTP credential ID on emailSend nodes
    if (smtpCredentialId && node.credentials?.smtp) {
      if (node.credentials.smtp.id !== smtpCredentialId) {
        node.credentials.smtp.id = smtpCredentialId;
        node.credentials.smtp.name = "SMTP Credentials";
        changed = true;
        console.log(`  - Patched SMTP credential on "${node.name}" -> id=${smtpCredentialId}`);
      }
    }

    // Patch IMAP credential ID on emailReadImap nodes
    if (imapCredentialId && node.credentials?.imap) {
      if (node.credentials.imap.id !== imapCredentialId) {
        node.credentials.imap.id = imapCredentialId;
        node.credentials.imap.name = "IMAP Account";
        changed = true;
        console.log(`  - Patched IMAP credential on "${node.name}" -> id=${imapCredentialId}`);
      }
    }
  }

  // Patch error workflow setting
  if (errorHandlerWorkflowId && wf.settings?.errorWorkflow !== errorHandlerWorkflowId) {
    wf.settings = wf.settings || {};
    wf.settings.errorWorkflow = errorHandlerWorkflowId;
    changed = true;
    console.log(`  - Patched Error Workflow -> ${errorHandlerWorkflowId}`);
  }

  // Filter settings to only allowed fields to prevent 400 Bad Request
  if (wf.settings) {
    const allowedSettingsFields = [
      "errorWorkflow",
      "timezone",
      "saveParentExecutions",
      "saveExecutionProgress",
      "saveManualExecutions",
      "executionTimeout"
    ];
    const filteredSettings = {};
    for (const k of allowedSettingsFields) {
      if (wf.settings[k] !== undefined) filteredSettings[k] = wf.settings[k];
    }
    wf.settings = filteredSettings;
  }

  if (changed) {
    const allowedFields = ["name", "nodes", "connections", "settings"];
    const payload = {};
    for (const k of allowedFields) { if (wf[k] !== undefined) payload[k] = wf[k]; }
    await apiRequest("PUT", `/workflows/${workflowId}`, payload);
  } else {
    console.log(`  - No changes needed`);
  }
  return changed;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=========================================");
  console.log("INVO MATCH - WORKFLOW IMPORT & AUTO-WIRE");
  console.log("=========================================\n");

  // Step 1: Provision credentials from .env (cached in N8N_IMAP_CRED_ID / N8N_SMTP_CRED_ID)
  console.log("Step 1: Provisioning credentials from .env...");
  const imapCredentialId = await provisionImap();
  const smtpCredentialId = await provisionSmtp();
  console.log();

  // Step 2: Import / update all workflows
  console.log("Step 2: Importing workflows...");
  const savedByFile = {};
  for (const file of WORKFLOW_FILES) {
    const filePath = path.resolve("workflows", file);
    const saved = await upsertWorkflow(filePath, imapCredentialId, smtpCredentialId);
    savedByFile[file] = saved;
  }

  const logAuditWf = savedByFile["log-audit-event.n8n.json"];
  const errorWf    = savedByFile["error-handler.n8n.json"];
  console.log(`\nLog Audit sub-workflow real ID : ${logAuditWf.id}`);
  console.log(`Error Handler sub-workflow real ID: ${errorWf.id}`);

  // Step 3: Patch executeWorkflow refs + credential IDs in ALL workflows
  console.log("\nStep 3: Patching workflow references and credential IDs...");
  for (const file of WORKFLOW_FILES) {
    const wf = savedByFile[file];
    console.log(`\n${file} (id=${wf.id}):`);
    await patchWorkflow(wf.id, {
      logAuditWorkflowId:     logAuditWf.id,
      errorHandlerWorkflowId: errorWf.id,
      smtpCredentialId,
      imapCredentialId
    });
  }

  // Step 4: Activate all workflows
  console.log("\nStep 4: Activating all workflows...");
  for (const file of WORKFLOW_FILES) {
    const wf = savedByFile[file];
    try {
      await apiRequest("POST", `/workflows/${wf.id}/activate`);
      console.log(`  - Activated: ${wf.name}`);
    } catch (e) {
      console.log(`  - Could not activate "${wf.name}" (may need a reachable trigger, or already active): ${e.message}`);
    }
  }

  console.log("\n✅ Done.");
  console.log("   IMAP credential ID : " + imapCredentialId);
  console.log("   SMTP credential ID : " + smtpCredentialId);
  console.log("   Both are saved to .env and wired into all workflow nodes.");
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
