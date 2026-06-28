import { generateIntegrationPrompt } from "./prompt-generator.mjs";

const state = {
  selectedId: new URLSearchParams(location.search).get("esc"),
  status: "pending",
  escalations: [],
  detail: null,
  developer: null,
  setupRequired: false,
  authMode: "signup",
  keys: [],
  agents: [],
  selectedAgentId: null,
  selectedKeyId: null,
  keyStatus: "all",
  keySearch: "",
  inboxSearch: "",
  includeTests: localStorage.getItem("forsig_include_tests") !== "false",
  auditRange: "all",
  quickstartTab: "node",
  promptTargetTool: "codex",
  workspace: null,
  lastApiKey: "",
  selectedAuditId: null,
  shadowSimulations: [],
  auditEvents: []
};

const $ = (selector) => document.querySelector(selector);

function toast(message) {
  let el = $("#forsig-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "forsig-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 1600);
}

function track(event, properties = {}) {
  window.forsigEvents = window.forsigEvents || [];
  window.forsigEvents.push({
    event,
    properties: {
      page: "developer",
      path: location.pathname,
      ...properties
    },
    at: new Date().toISOString()
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message || payload.error || "Request failed.");
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function prettyJson(value) {
  if (!value) return "{}";
  return JSON.stringify(value, null, 2);
}

function showLogin() {
  $("#developer-sidebar").hidden = true;
  $("#developer-login").hidden = false;
  $("#developer-password").hidden = true;
  $("#developer-app").hidden = true;
  $("#developer-login-form").hidden = false;
  setAuthMode("signup");
}

function showApp() {
  $("#developer-sidebar").hidden = false;
  $("#developer-login").hidden = true;
  $("#developer-password").hidden = true;
  $("#developer-app").hidden = false;
}

function passwordStrengthError(password) {
  if (!password || password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one special character.";
  return "";
}

function showPasswordReset(copy = "Use at least 10 characters with uppercase, lowercase, number, and special character.") {
  $("#developer-sidebar").hidden = true;
  $("#developer-login").hidden = true;
  $("#developer-password").hidden = false;
  $("#developer-app").hidden = true;
  $("#developer-reset-password-form").hidden = false;
  $("#developer-reset-copy").textContent = copy;
  $("#developer-reset-password-form").elements.password.focus();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const form = $("#developer-login-form");
  const isSignup = mode === "signup";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  $(".auth-mode-tabs").hidden = false;
  $("#developer-login-title").textContent = isSignup ? "Developer signup" : "Developer sign in";
  $("#developer-login-copy").textContent = isSignup
    ? "Use the email and access code your admin sent you. You will create a password next."
    : "Use your email and password. Temporary passwords from forgot password also work here.";
  form.hidden = false;
  $("#developer-password").hidden = true;
  form.elements.accessCode.hidden = !isSignup;
  form.elements.accessCode.required = isSignup;
  form.elements.password.hidden = isSignup;
  form.elements.password.required = !isSignup;
  form.elements.password.autocomplete = "current-password";
  form.elements.password.placeholder = "Password";
  $("#developer-login-submit").textContent = isSignup ? "Continue" : "Sign in";
  $("#developer-forgot-password").hidden = isSignup;
  form.querySelector(".mini-status").textContent = "";
}

function setView(view) {
  document.querySelectorAll("[data-developer-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.developerView === view);
  });
  document.querySelectorAll(".admin-view").forEach((section) => {
    section.hidden = section.id !== `developer-view-${view}`;
  });
  if (view === "inbox" && state.selectedId) showInboxList();
  if (view === "keys") {
    showKeyList();
    loadKeys();
  }
  if (view === "agents") {
    showAgentList();
    loadAgents();
  }
  if (view === "quickstart") {
    renderQuickstart();
  }
  if (view === "integration") {
    renderIntegrationPrompt();
  }
  if (view === "shadow") {
    loadShadowSimulations();
  }
  if (view === "audit") loadAudit();
  if (view !== "audit-detail") state.selectedAuditId = null;
  if (view === "profile") loadProfile();
  if (view === "settings") {
    loadWorkspace();
  }
}

async function checkSession() {
  const session = await api("/api/developer/me");
  if (session.authenticated) {
    state.developer = session.developer;
    if (session.developer.mustResetPassword) {
      showLogin();
      state.developer = session.developer;
      showPasswordReset("You are using a temporary or first-time password. Create a new password before continuing.");
      return;
    }
    showApp();
    $("#developer-workspace-label").textContent = "";
    $("#developer-workspace-name").textContent = session.developer.workspaceName || "Forsig";
    $("#developer-user-email").textContent = session.developer.email || "Developer console";
    await Promise.all([loadWorkspace(), loadEscalations(), loadAgents(), loadKeys()]);
    if (state.selectedId) await loadDetail(state.selectedId);
  } else {
    showLogin();
  }
}

async function loadWorkspace() {
  try {
    const data = await api("/api/developer/workspace");
    state.workspace = data.workspace || null;
    const form = $("#developer-workspace-form");
    if (data.workspace && form) {
      form.elements.name.value = data.workspace.name || "";
      if (state.developer) state.developer.workspaceName = data.workspace.name || "Workspace";
      $("#developer-workspace-label").textContent = "";
      $("#developer-workspace-name").textContent = data.workspace.name || "Forsig";
      if (state.developer?.email) $("#developer-user-email").textContent = state.developer.email;
    }
    const notificationForm = $("#developer-notification-form");
    if (data.workspace && notificationForm) {
      notificationForm.elements.emailNotificationsEnabled.checked = data.workspace.email_notifications_enabled !== false;
      notificationForm.elements.defaultReviewerEmails.value = Array.isArray(data.workspace.default_reviewer_emails)
        ? data.workspace.default_reviewer_emails.join(", ")
        : "";
      const promptReviewers = $("#developer-ai-reviewers");
      if (promptReviewers && !promptReviewers.value.trim()) {
        promptReviewers.value = notificationForm.elements.defaultReviewerEmails.value;
      }
    }
    renderOnboarding();
    renderQuickstart();
  } catch (error) {
    $("#developer-workspace-form .mini-status").textContent = error.message;
  }
}

async function loadKeys() {
  const list = $("#developer-api-key-list");
  list.innerHTML = "<p class='empty-state'>Loading keys...</p>";
  try {
    const data = await api("/api/developer/api-key");
    state.keys = data.keys || [];
    renderKeys();
    renderOnboarding();
    renderQuickstart();
    if (state.selectedKeyId) showKeyDetail(state.selectedKeyId);
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

function keyStatus(key) {
  if (key.revoked_at) return "revoked";
  if (key.held_at) return "held";
  return "active";
}

function maskedKey(key) {
  const prefix = String(key.prefix || key.id || "fsk").slice(0, 8);
  return `${prefix}...`;
}

function rangeCutoff(range) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const ranges = {
    "24h": day,
    "7d": 7 * day,
    "30d": 30 * day,
    "3m": 90 * day,
    "6m": 180 * day,
    "1y": 365 * day
  };
  return ranges[range] ? new Date(now - ranges[range]) : null;
}

function renderKeys() {
  const list = $("#developer-api-key-list");
  const query = state.keySearch.trim().toLowerCase();
  const keys = state.keys.filter((key) => {
    const status = keyStatus(key);
    const matchesStatus = state.keyStatus === "all" || state.keyStatus === status;
    const matchesQuery = !query || `${key.name} ${key.prefix || ""}`.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });
  if (!keys.length) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No API keys yet.</strong>
        <p>Create a key, copy it once, then run the Quickstart script to send your first real escalation.</p>
        <div class="developer-empty-actions">
          <button type="button" onclick="document.querySelector('#developer-create-api-key').click()">Create API key</button>
          <button type="button" data-developer-view="quickstart">Open Quickstart</button>
        </div>
      </div>
    `;
    return;
  }
  list.innerHTML = `
    <div class="resend-table-row resend-table-head">
      <span>Name</span><span>Token</span><span>Status</span><span>Last used</span><span>Created</span><span></span>
    </div>
    ${keys.map((key) => {
      const status = keyStatus(key);
      return `
        <div class="resend-table-row selectable-row" data-api-key-id="${escapeHtml(key.id)}">
          <span><b>${escapeHtml(key.name)}</b></span>
          <span><code>${escapeHtml(maskedKey(key))}</code></span>
          <span><em class="key-state key-state-${status}">${status}</em></span>
          <span>${key.last_used_at ? formatDate(key.last_used_at) : "Never"}</span>
          <span>${formatDate(key.created_at)}</span>
          <span class="row-actions">
            ${status === "revoked" ? "" : `
              <button type="button" data-hold-key="${escapeHtml(key.id)}" data-hold-value="${status === "held" ? "false" : "true"}">${status === "held" ? "Unhold" : "Hold"}</button>
              <button type="button" data-revoke-key="${escapeHtml(key.id)}">Revoke</button>
            `}
          </span>
        </div>
      `;
    }).join("")}
  `;
}

function showKeyList() {
  state.selectedKeyId = null;
  $("#developer-api-key-detail").hidden = true;
  $(".key-table-toolbar").hidden = false;
  $("#developer-api-key-list").hidden = false;
  $("#developer-view-keys .developer-page-head").hidden = false;
}

function showKeyDetail(id) {
  const key = state.keys.find((item) => item.id === id);
  if (!key) return;
  state.selectedKeyId = id;
  const status = keyStatus(key);
  $("#developer-api-key-list").hidden = true;
  $(".key-table-toolbar").hidden = true;
  $("#developer-view-keys .developer-page-head").hidden = true;
  const detail = $("#developer-api-key-detail");
  detail.hidden = false;
  detail.innerHTML = `
    <button type="button" class="developer-back-button" data-back-keys>Back to API keys</button>
    <div class="developer-detail-hero">
      <div class="developer-detail-icon">K</div>
      <div>
        <span>API key</span>
        <h2>${escapeHtml(key.name)}</h2>
      </div>
      <em class="key-state key-state-${status}">${status}</em>
    </div>
    <div class="developer-detail-grid">
      <article><span>Token</span><strong>${escapeHtml(maskedKey(key))}</strong></article>
      <article><span>Last used</span><strong>${key.last_used_at ? formatDate(key.last_used_at) : "Never"}</strong></article>
      <article><span>Created</span><strong>${formatDate(key.created_at)}</strong></article>
      <article><span>Permission</span><strong>Full access</strong></article>
    </div>
    <div class="developer-detail-actions">
      ${status === "revoked" ? "" : `
        <button type="button" data-hold-key="${escapeHtml(key.id)}" data-hold-value="${status === "held" ? "false" : "true"}">${status === "held" ? "Unhold key" : "Hold key"}</button>
        <button type="button" data-revoke-key="${escapeHtml(key.id)}">Revoke key</button>
      `}
    </div>
  `;
}

async function loadProfile() {
  const form = $("#developer-profile-form");
  const status = form.querySelector(".mini-status");
  status.textContent = "";
  try {
    const data = await api("/api/developer/profile");
    if (data.profile) {
      form.elements.name.value = data.profile.name || "";
      form.elements.email.value = data.profile.email || "";
      form.elements.company.value = data.profile.company || "";
    }
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadAudit() {
  const list = $("#developer-audit-list");
  list.innerHTML = "<p class='empty-state'>Loading audit trail...</p>";
  try {
    const data = await api("/api/developer/audit");
    const cutoff = rangeCutoff(state.auditRange);
    state.auditEvents = (data.events || []).filter((event) => !cutoff || new Date(event.created_at) >= cutoff);
    list.innerHTML = state.auditEvents.length ? `
      <div class="resend-table-row resend-table-head audit-table-row">
        <span>Event</span><span>Target</span><span>Actor</span><span>Time</span>
      </div>
      ${state.auditEvents.map((event) => `
        <button type="button" class="resend-table-row audit-row audit-table-row selectable-row" data-audit-id="${escapeHtml(event.id)}">
          <span><b>${escapeHtml(event.event_type)}</b><small>${escapeHtml(JSON.stringify(event.metadata_json || {}))}</small></span>
          <span>${escapeHtml(event.task_title || event.escalation_id || "Workspace")}</span>
          <span>${escapeHtml(auditActorLabel(event))}</span>
          <span>${formatDate(event.created_at)}</span>
        </button>
      `).join("")}
    ` : "<p class='empty-state'>No audit events for this time range.</p>";
    renderOnboarding();
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

function auditActorLabel(event) {
  if (event.actor_email) return event.actor_name ? `${event.actor_name} (${event.actor_email})` : event.actor_email;
  if (event.metadata_json?.reviewerName) return event.metadata_json.reviewerName;
  if (event.metadata_json?.reviewerEmail) return event.metadata_json.reviewerEmail;
  if (event.actor_type === "agent") return event.actor_id || "Agent";
  if (event.actor_type === "system") return "System";
  return event.actor_id || event.actor_type || "-";
}

function showAuditDetail(id) {
  const event = state.auditEvents.find((item) => item.id === id);
  if (!event) return;
  state.selectedAuditId = id;
  document.querySelectorAll(".admin-view").forEach((section) => {
    section.hidden = section.id !== "developer-view-audit-detail";
  });
  document.querySelectorAll("[data-developer-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.developerView === "audit");
  });
  const detail = $("#developer-audit-detail");
  detail.innerHTML = `
    <button type="button" class="developer-back-button" data-back-audit>Back to audit trails</button>
    <div class="developer-detail-hero">
      <div class="developer-detail-icon">L</div>
      <div>
        <span>Audit event</span>
        <h2>${escapeHtml(event.event_type)}</h2>
      </div>
      <em class="key-state key-state-active">${formatDate(event.created_at)}</em>
    </div>
    <div class="developer-detail-grid">
      <article><span>Actor</span><strong>${escapeHtml(auditActorLabel(event))}</strong></article>
      <article><span>Actor type</span><strong>${escapeHtml(event.actor_type || "-")}</strong></article>
      <article><span>Target</span><strong>${escapeHtml(event.task_title || event.escalation_id || "Workspace")}</strong></article>
      <article><span>Status</span><strong>${escapeHtml(event.escalation_status || "Recorded")}</strong></article>
    </div>
    <section class="detail-section">
      <h3>Metadata</h3>
      <pre><code>${escapeHtml(JSON.stringify(event.metadata_json || {}, null, 2))}</code></pre>
    </section>
    <section class="detail-section">
      <h3>Raw event</h3>
      <pre><code>${escapeHtml(JSON.stringify(event, null, 2))}</code></pre>
    </section>
  `;
}

function agentSnippet(agent) {
  const slug = agent.slug || "refund-agent";
  const name = agent.name || "Refund Agent";
  const environment = agent.environment || "development";
  return `const decision = await forsig.escalate({
  agent: { id: "${slug}", name: "${name}", environment: "${environment}" },
  risk: { type: "refund_over_limit", level: "high" },
  task: {
    title: "Approve refund for customer #123",
    proposedAction: "Issue a $500 refund",
    customerImpact: true
  },
  context: { customerTier: "VIP", refundAmount: 500 },
  waitForDecision: true
});`;
}

function activeApiKey() {
  return state.keys.find((key) => keyStatus(key) === "active") || state.keys[0] || null;
}

function starterAgent() {
  return state.agents.find((agent) => !agent.archived_at) || state.agents[0] || { slug: "refund-agent", name: "Refund Agent", environment: "development" };
}

function checklistItems() {
  const hasAgent = state.agents.some((agent) => !agent.archived_at);
  const hasKey = state.keys.some((key) => keyStatus(key) === "active");
  const hasEscalation = state.escalations.some((item) => !item.testMode);
  const hasDecision = state.escalations.some((item) => !item.testMode && item.status !== "pending");
  return [
    { label: "Starter agent ready", done: hasAgent, view: "agents" },
    { label: "API key created", done: hasKey, view: "keys" },
    { label: "First real escalation received", done: hasEscalation, view: "quickstart" },
    { label: "First decision sent", done: hasDecision, view: "inbox" }
  ];
}

function renderChecklist(container) {
  if (!container) return;
  const items = checklistItems();
  const complete = items.filter((item) => item.done).length;
  container.innerHTML = `
    <div>
      <span class="zip-section-label">First-run checklist</span>
      <strong>${complete}/4 complete</strong>
    </div>
    ${items.map((item) => `
      <button type="button" data-checklist-view="${item.view}" class="${item.done ? "done" : ""}">
        <span>${item.done ? "Done" : "Next"}</span>
        ${escapeHtml(item.label)}
      </button>
    `).join("")}
  `;
}

function renderOnboarding() {
  renderChecklist($("#developer-quickstart-checklist"));
}

function quickstartSnippets() {
  const agent = starterAgent();
  const agentId = agent.slug || agent.id || "refund-agent";
  const agentName = agent.name || "Refund Agent";
  const baseUrl = location.origin || "https://www.forsig.com";
  const envKey = state.lastApiKey || "paste_your_full_forsig_api_key_here";
  const payload = {
    agent: { id: agentId, name: agentName, environment: agent.environment || "development" },
    workflow: "refund-review-flow",
    step: "refund-over-limit",
    risk: { type: "refund_over_limit", level: "high", reason: "Refund amount is above the automatic approval limit." },
    task: {
      title: "Approve refund for customer #123",
      description: "The agent wants to issue a $500 refund to a VIP customer.",
      proposedAction: "Issue a $500 refund",
      customerImpact: true
    },
    context: { customerId: "cus_123", customerTier: "VIP", refundAmount: 500 },
    mode: "shadow",
    review: { notify: ["dashboard", "email"] },
    timeoutSeconds: 900
  };
  const jsonPayload = JSON.stringify(payload, null, 2);
  return {
    node: `const BASE_URL = "${baseUrl}";
const FORSIG_API_KEY = process.env.FORSIG_API_KEY || "${envKey}";

async function forsig(path, options = {}) {
  const response = await fetch(\`\${BASE_URL}\${path}\`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: \`Bearer \${FORSIG_API_KEY}\`,
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error?.message || "Forsig request failed");
  return data;
}

const created = await forsig("/api/v1/escalations", {
  method: "POST",
  body: JSON.stringify(${jsonPayload})
});

console.log("Review in Forsig:", created.dashboardUrl || created.dashboard_url);

while (true) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const result = await forsig(\`/api/v1/escalations/\${created.id}\`);
  if (result.escalation.status !== "pending") {
    console.log("Decision:", result.escalation.decision || result.escalation);
    break;
  }
}`,
    python: `import os, time, requests

BASE_URL = "${baseUrl}"
FORSIG_API_KEY = os.environ.get("FORSIG_API_KEY", "${envKey}")

payload = ${JSON.stringify(payload, null, 2).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None")}

headers = {
    "authorization": f"Bearer {FORSIG_API_KEY}",
    "content-type": "application/json",
}

created = requests.post(f"{BASE_URL}/api/v1/escalations", json=payload, headers=headers).json()
print("Review in Forsig:", created.get("dashboardUrl") or created.get("dashboard_url"))

while True:
    time.sleep(3)
    result = requests.get(f"{BASE_URL}/api/v1/escalations/{created['id']}", headers=headers).json()
    if result["escalation"]["status"] != "pending":
        print("Decision:", result["escalation"].get("decision") or result["escalation"])
        break`,
    curl: `curl -X POST ${baseUrl}/api/v1/escalations \\
  -H "authorization: Bearer ${envKey}" \\
  -H "content-type: application/json" \\
  -d '${JSON.stringify(payload)}'`,
    langgraph: `// LangGraph pattern: call Forsig before a risky tool node.
async function refundApprovalNode(state) {
  const decision = await forsig.escalate({
    agent: { id: "${agentId}", name: "${agentName}" },
    risk: { type: "refund_over_limit", level: "high" },
    task: {
      title: "Approve refund for customer #123",
      proposedAction: "Issue a $500 refund"
    },
    context: { refundAmount: 500, customerTier: "VIP" },
    waitForDecision: true
  });

  if (decision.status === "approved") return { ...state, approved: true };
  if (decision.status === "edited") return { ...state, instruction: decision.instruction };
  return { ...state, stopped: true };
}`,
    vercel: `// Vercel AI SDK / server action pattern.
export async function approveRiskyRefund() {
  "use server";

  const decision = await forsig.escalate({
    agent: { id: "${agentId}", name: "${agentName}" },
    risk: { type: "refund_over_limit", level: "high" },
    task: {
      title: "Approve refund for customer #123",
      proposedAction: "Issue a $500 refund"
    },
    context: { refundAmount: 500, customerTier: "VIP" },
    waitForDecision: true
  });

  return decision.status === "approved" ? issueRefund() : decision;
}`,
    n8n: `// n8n HTTP Request node
POST ${baseUrl}/api/v1/escalations
Headers:
  authorization: Bearer ${envKey}
  content-type: application/json
Body:
${jsonPayload}

// Then pause your workflow and poll:
GET ${baseUrl}/api/v1/escalations/{{$json.id}}`
  };
}

function renderIntegrationPrompt() {
  const output = $("#developer-ai-prompt-output");
  if (!output) return;
  output.textContent = generateAiInstallPrompt();
  document.querySelectorAll("[data-prompt-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.promptTool === state.promptTargetTool);
  });
}

function generateAiInstallPrompt() {
  const selectedRisks = Array.from(document.querySelectorAll(".ai-risk-picker input:checked"))
    .map((input) => input.value);
  const customRequest = $("#developer-ai-prompt-input")?.value.trim();
  const request = [
    selectedRisks.length ? `Require Forsig approval before ${selectedRisks.join(", ")}.` : "",
    customRequest || ""
  ].filter(Boolean).join(" ");
  const agent = starterAgent();
  const agentId = agent.slug || agent.id || "refund-agent";
  const baseUrl = location.origin || "https://www.forsig.com";
  const framework = $("#developer-ai-framework")?.value || "Node / TypeScript agent";
  const mode = $("#developer-ai-mode")?.value || "shadow";
  const reviewerEmails = $("#developer-ai-reviewers")?.value.trim()
    || (Array.isArray(state.workspace?.default_reviewer_emails) ? state.workspace.default_reviewer_emails.join(", ") : "");
  return generateIntegrationPrompt({
    goal: request,
    targetTool: state.promptTargetTool,
    agentId,
    baseUrl,
    framework,
    mode,
    reviewerEmails,
    sdkPackage: framework.toLowerCase().includes("python") ? "forsig-sdk" : "@forsig/sdk"
  });
}

function aiInstallCommand() {
  const framework = $("#developer-ai-framework")?.value || "";
  return framework.toLowerCase().includes("python") ? "pip install forsig-sdk" : "npm install @forsig/sdk";
}

function renderQuickstart() {
  const code = $("#developer-quickstart-code");
  if (!code) return;
  renderOnboarding();
  const snippets = quickstartSnippets();
  code.textContent = snippets[state.quickstartTab] || snippets.node;
  document.querySelectorAll("[data-quickstart-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.quickstartTab === state.quickstartTab);
  });
  const promptOutput = $("#developer-ai-prompt-output");
  if (promptOutput && !promptOutput.textContent.trim()) {
    renderIntegrationPrompt();
  }
}

async function loadShadowSimulations() {
  const list = $("#developer-shadow-list");
  if (!list) return;
  list.innerHTML = "<p class='empty-state'>Loading shadow simulations...</p>";
  try {
    const data = await api("/api/developer/escalations?status=shadow_logged");
    state.shadowSimulations = data.escalations || [];
    list.innerHTML = state.shadowSimulations.length ? `
      <div class="resend-table-row inbox-table-row resend-table-head">
        <span>Checkpoint</span><span>Status</span><span>Mode</span><span>Agent</span><span>Risk</span><span>Created</span>
      </div>
      ${state.shadowSimulations.map((item) => `
        <button type="button" data-escalation-id="${escapeHtml(item.id)}" class="resend-table-row selectable-row inbox-table-row">
          <span><b>${escapeHtml(item.task?.title || item.id)}</b><small>Would have required approval</small></span>
          <span><em class="key-state key-state-held">Shadow logged</em></span>
          <span><em class="key-state key-state-active">Shadow</em></span>
          <span>${escapeHtml(item.agent?.name || item.agent?.id || "Agent")}</span>
          <span>${escapeHtml(item.risk?.type || item.risk?.level || "review")}</span>
          <span>${formatDate(item.createdAt)}</span>
        </button>
      `).join("")}
    ` : "<p class='empty-state'>No shadow simulations yet. Use <code>mode: \"shadow\"</code> in an escalation request to log non-blocking checkpoints.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

async function loadAgents() {
  const list = $("#developer-agent-list");
  list.innerHTML = "<p class='empty-state'>Loading agents...</p>";
  try {
    const data = await api("/api/developer/agents");
    state.agents = data.agents || [];
    renderAgents();
    renderOnboarding();
    renderQuickstart();
    if (state.selectedAgentId) showAgentDetail(state.selectedAgentId);
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

function renderAgents() {
  const list = $("#developer-agent-list");
  if (!state.agents.length) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No agents yet.</strong>
        <p>Create an agent for the workflow that needs approval. Forsig will use it to group escalations and reviewer defaults.</p>
        <div class="developer-empty-actions">
          <button type="button" onclick="document.querySelector('#developer-create-agent').click()">Create agent</button>
        </div>
      </div>
    `;
    return;
  }
  list.innerHTML = `
    <div class="resend-table-row agent-table-row resend-table-head">
      <span>Agent</span><span>Environment</span><span>Escalations</span><span>Pending</span><span>Status</span>
    </div>
    ${state.agents.map((agent) => `
      <button type="button" class="resend-table-row agent-table-row selectable-row" data-agent-id="${escapeHtml(agent.id)}">
        <span><b>${escapeHtml(agent.name)}</b><small>${escapeHtml(agent.slug)}</small></span>
        <span>${escapeHtml(agent.environment)}</span>
        <span>${agent.escalation_count || 0}</span>
        <span>${agent.pending_count || 0}</span>
        <span><em class="key-state key-state-${agent.archived_at ? "held" : "active"}">${agent.archived_at ? "Archived" : "Active"}</em></span>
      </button>
    `).join("")}
  `;
}

function showAgentList() {
  state.selectedAgentId = null;
  $("#developer-agent-detail").hidden = true;
  $("#developer-agent-list").hidden = false;
  $("#developer-view-agents .developer-page-head").hidden = false;
}

function showAgentDetail(id) {
  const agent = state.agents.find((item) => item.id === id);
  if (!agent) return;
  state.selectedAgentId = id;
  $("#developer-agent-list").hidden = true;
  $("#developer-view-agents .developer-page-head").hidden = true;
  const detail = $("#developer-agent-detail");
  detail.hidden = false;
  detail.innerHTML = `
    <button type="button" class="developer-back-button" data-back-agents>Back to agents</button>
    <div class="developer-detail-hero">
      <div class="developer-detail-icon">A</div>
      <div>
        <span>Agent</span>
        <h2>${escapeHtml(agent.name)}</h2>
      </div>
      <em class="key-state key-state-${agent.archived_at ? "held" : "active"}">${agent.archived_at ? "Archived" : "Active"}</em>
    </div>
    <div class="developer-detail-grid">
      <article><span>Slug</span><strong>${escapeHtml(agent.slug)}</strong></article>
      <article><span>Environment</span><strong>${escapeHtml(agent.environment)}</strong></article>
      <article><span>Escalations</span><strong>${agent.escalation_count || 0}</strong></article>
      <article><span>Pending</span><strong>${agent.pending_count || 0}</strong></article>
    </div>
    <section class="detail-section">
      <h3>Description</h3>
      <p>${escapeHtml(agent.description || "No description yet.")}</p>
    </section>
    <section class="detail-section">
      <h3>SDK snippet</h3>
      <pre><code>${escapeHtml(agentSnippet(agent))}</code></pre>
    </section>
    <div class="developer-detail-actions">
      <button type="button" data-copy-key="${escapeHtml(agentSnippet(agent))}">Copy snippet</button>
      ${agent.archived_at ? `<button type="button" data-archive-agent="${escapeHtml(agent.id)}" data-archive-value="false">Unarchive</button>` : `<button type="button" data-archive-agent="${escapeHtml(agent.id)}" data-archive-value="true">Archive</button>`}
    </div>
  `;
}

async function loadEscalations() {
  const data = await api(`/api/developer/escalations?status=${encodeURIComponent(state.status)}`);
  state.escalations = data.escalations || [];
  renderInboxRows();
  renderOnboarding();
  renderQuickstart();
}

function showInboxList() {
  state.selectedId = null;
  state.detail = null;
  $("#developer-view-escalation").hidden = true;
  $("#developer-view-inbox").hidden = false;
  $("#developer-escalation-detail").innerHTML = "<p class='empty-state'>Select an escalation to review.</p>";
  $("#developer-escalation-list").hidden = false;
  $("#developer-view-inbox .admin-toolbar").hidden = false;
  $("#developer-view-inbox .developer-page-head").hidden = false;
  history.replaceState(null, "", "/developer");
  renderInboxRows();
}

function renderInboxRows() {
  const list = $("#developer-escalation-list");
  const query = state.inboxSearch.trim().toLowerCase();
  const escalations = state.escalations.filter((item) => {
    if (!state.includeTests && item.testMode) return false;
    if (!query) return true;
    return [
      item.task?.title,
      item.status,
      item.agent?.name,
      item.agent?.id,
      item.risk?.level,
      item.risk?.type
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  });
  if (!escalations.length) {
    const pendingOnly = state.status === "pending";
    list.innerHTML = `
      <div class="empty-state">
        <strong>${pendingOnly ? "No pending escalations." : "No escalations match this view."}</strong>
        <p>${pendingOnly ? "Everything is working fine. New agent requests that need review will appear here." : "Try changing the status filter or search query."}</p>
      </div>
    `;
    return;
  }
  list.innerHTML = `
    <div class="resend-table-row resend-table-head inbox-table-row inbox-table-head">
      <span>Request</span><span>Status</span><span>Mode</span><span>Agent</span><span>Risk</span><span>Created</span>
    </div>
    ${escalations.map((item) => `
      <button type="button" data-escalation-id="${escapeHtml(item.id)}" class="resend-table-row selectable-row inbox-table-row ${item.id === state.selectedId ? "active" : ""}">
        <span>
          <b>${escapeHtml(item.task?.title || item.id)}</b>
          <small>${escapeHtml(item.workflow || item.step || "Approval request")}</small>
        </span>
        <span><em class="key-state key-state-${escapeHtml(item.status)}">${escapeHtml(item.status)}</em></span>
        <span><em class="key-state key-state-${item.mode === "shadow" ? "held" : item.testMode ? "held" : "active"}">${item.mode === "shadow" ? "Shadow" : item.testMode ? "Test" : "Real"}</em></span>
        <span>${escapeHtml(item.agent?.name || item.agent?.id || "Agent")}</span>
        <span>${escapeHtml(item.risk?.level || "review")}</span>
        <span>${formatDate(item.createdAt)}</span>
      </button>
    `).join("")}
  `;
}

async function loadDetail(id) {
  state.selectedId = id;
  const data = await api(`/api/developer/escalations/${encodeURIComponent(id)}`);
  state.detail = data;
  history.replaceState(null, "", `/developer?esc=${encodeURIComponent(id)}`);
  document.querySelectorAll(".admin-view").forEach((section) => {
    section.hidden = section.id !== "developer-view-escalation";
  });
  document.querySelectorAll("[data-developer-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.developerView === "inbox");
  });
  renderDetail();
  $("#developer-view-escalation").scrollIntoView({ behavior: "smooth", block: "start" });
}

function decisionButton(status, label) {
  return `<button type="button" data-decision-status="${status}">${label}</button>`;
}

function renderDetail() {
  const detail = $("#developer-escalation-detail");
  const item = state.detail?.escalation;
  if (!item) {
    detail.innerHTML = "<p class='empty-state'>Select an escalation to review.</p>";
    return;
  }

  const canDecide = item.status === "pending";
  detail.innerHTML = `
    <div class="product-review-page">
      <button type="button" class="developer-back-button" data-back-inbox>Back to inbox</button>
      <div class="product-review-header">
        <div class="zip-risk-icon">!</div>
        <div>
          <h2>${escapeHtml(item.task?.title)}</h2>
          <p>${escapeHtml(item.task?.description || "The agent is waiting for human judgment before it continues.")}</p>
        </div>
        <span>${item.mode === "shadow" ? "shadow simulation" : item.testMode ? "test escalation" : escapeHtml(item.status)}</span>
      </div>

      <section class="product-review-grid">
        <article class="product-review-card">
          <span>Agent</span>
          <strong>${escapeHtml(item.agent?.name || item.agent?.id || "Agent")}</strong>
          <p>${escapeHtml(item.workflow || "approval workflow")}${item.runId ? ` / ${escapeHtml(item.runId)}` : ""}</p>
        </article>
        <article class="product-review-card risk">
          <span>Risk</span>
          <strong>${escapeHtml(item.risk?.level || "review")}</strong>
          <p>${escapeHtml(item.risk?.reason || item.risk?.type || "Human review requested.")}</p>
        </article>
      </section>

      <section class="detail-section product-action-box">
        <h3>Proposed action</h3>
        <pre><code>${escapeHtml(JSON.stringify({ action: item.task?.proposedAction, customerImpact: item.task?.customerImpact, risk: item.risk?.type }, null, 2))}</code></pre>
      </section>

      <section class="detail-section product-context-box">
        <h3>Context</h3>
        <pre><code>${escapeHtml(prettyJson(item.context))}</code></pre>
      </section>

      <section class="detail-section product-decision-box">
      <h3>Decision returned to agent</h3>
      <p class="section-helper">${item.mode === "shadow" ? "Shadow mode: approval would have been required, but execution was not blocked. " : ""}${item.reviewer?.assignedEmail ? `Assigned to ${escapeHtml(item.reviewer.assignedEmail)}. ` : ""}${item.expiresAt ? `Expires ${formatDate(item.expiresAt)}. ` : ""}${item.testMode ? `Mode: ${escapeHtml(item.testMode)}.` : `Mode: ${escapeHtml(item.mode || "active")}.`}</p>
      ${canDecide ? `
        <div class="decision-actions">
          ${decisionButton("approved", "Approve")}
          ${decisionButton("rejected", "Reject")}
          ${decisionButton("edited", "Edit")}
          ${decisionButton("context_added", "Add context")}
          ${decisionButton("taken_over", "Take over")}
          ${decisionButton("needs_more_info", "More info")}
        </div>
        <form id="developer-decision-form" class="decision-form">
          <input name="status" type="hidden" value="approved" />
          <label>Instruction returned to the agent</label>
          <textarea name="instruction" placeholder="Proceed with the proposed action.">Proceed with the proposed action.</textarea>
          <label>Optional reviewer note</label>
          <input name="comment" type="text" placeholder="Internal note" />
          <button type="submit">Send decision</button>
          <p class="mini-status" role="status"></p>
        </form>
      ` : `
        <div class="product-result-box">
          <strong>${escapeHtml(item.decision?.status || item.status)}</strong>
          <p>${escapeHtml(item.decision?.instruction || "Decision recorded.")}</p>
        </div>
      `}
      </section>

      <section class="detail-section product-audit-box">
        <h3>Audit trail</h3>
        <div class="audit-list">
          ${(state.detail.auditEvents || []).map((event) => `
            <article>
              <strong>${escapeHtml(event.event_type)}</strong>
              <span>${formatDate(event.created_at)} / ${escapeHtml(event.actor_type)}</span>
              <small>${escapeHtml(JSON.stringify(event.metadata_json || {}))}</small>
            </article>
          `).join("") || "<p class='empty-state'>No audit events yet.</p>"}
        </div>
      </section>
    </div>
  `;
}

async function submitDecision(form) {
  const payload = {
    status: form.elements.status.value,
    instruction: form.elements.instruction.value.trim(),
    comment: form.elements.comment.value.trim()
  };
  const statusEl = form.querySelector(".mini-status");
  statusEl.textContent = "Sending decision...";
  await api(`/api/developer/escalations/${encodeURIComponent(state.selectedId)}/decision`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  toast("Decision sent");
  track("decision_sent", { escalationId: state.selectedId, status: payload.status });
  statusEl.textContent = "Decision sent.";
  await loadEscalations();
  await loadDetail(state.selectedId);
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

$("#developer-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Checking...";
  try {
    const email = form.elements.email.value.trim();
    const payload = state.authMode === "signup"
      ? { email, accessCode: form.elements.accessCode.value.trim() }
      : { email, password: form.elements.password.value };
    const data = await api("/api/developer/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (data.setupRequired || data.mustResetPassword || data.developer?.mustResetPassword) {
      state.setupRequired = true;
      state.developer = data.developer || state.developer;
      status.textContent = "";
      showPasswordReset(data.message || "Create a new password before opening your beta workspace.");
      return;
    }
    state.developer = data.developer;
    status.textContent = "";
    state.setupRequired = false;
    $("#developer-login-form").hidden = false;
    showApp();
    await Promise.all([loadWorkspace(), loadEscalations(), loadAgents(), loadKeys()]);
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-forgot-password").addEventListener("click", async () => {
  const form = $("#developer-login-form");
  const status = form.querySelector(".mini-status");
  const email = form.elements.email.value.trim();
  if (!email) {
    status.textContent = "Enter your beta access email first.";
    return;
  }
  status.textContent = "Sending temporary password...";
  try {
    const result = await api("/api/developer/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    status.textContent = result.sent
      ? "Temporary password sent. Log in with it, then create a new password."
      : "If this email has beta password access, a temporary password will be sent.";
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Saving password...";
  try {
    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;
    const strengthError = passwordStrengthError(password);
    if (strengthError) {
      status.textContent = strengthError;
      return;
    }
    if (password !== confirmPassword) {
      status.textContent = "Passwords do not match.";
      return;
    }
    await api("/api/developer/password", {
      method: "POST",
      body: JSON.stringify({
        password,
        confirmPassword
      })
    });
    status.textContent = "";
    state.setupRequired = false;
    if (state.developer) state.developer.mustResetPassword = false;
    toast("Password updated");
    $("#developer-login-form").hidden = false;
    showApp();
    await Promise.all([loadWorkspace(), loadEscalations(), loadAgents(), loadKeys()]);
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-logout").addEventListener("click", async () => {
  await api("/api/developer/logout", { method: "POST", body: "{}" }).catch(() => null);
  showLogin();
});

$("#developer-status-filter").addEventListener("change", async (event) => {
  state.status = event.target.value;
  showInboxList();
  await loadEscalations();
});

$("#developer-inbox-search").addEventListener("input", (event) => {
  state.inboxSearch = event.target.value;
  renderInboxRows();
});

function setIncludeTests(value) {
  state.includeTests = value;
  localStorage.setItem("forsig_include_tests", value ? "true" : "false");
  $("#developer-include-tests").checked = value;
  $("#developer-settings-include-tests").checked = value;
  renderInboxRows();
  if (!$("#developer-view-audit").hidden) loadAudit();
}

$("#developer-include-tests").checked = state.includeTests;
$("#developer-settings-include-tests").checked = state.includeTests;
$("#developer-include-tests").addEventListener("change", (event) => setIncludeTests(event.target.checked));
$("#developer-settings-include-tests").addEventListener("change", (event) => setIncludeTests(event.target.checked));

["#developer-ai-framework", "#developer-ai-mode", "#developer-ai-reviewers", "#developer-ai-prompt-input"].forEach((selector) => {
  const element = $(selector);
  if (!element) return;
  element.addEventListener("input", () => {
    if (!$("#developer-view-integration").hidden) renderIntegrationPrompt();
  });
  element.addEventListener("change", () => {
    if (!$("#developer-view-integration").hidden) renderIntegrationPrompt();
  });
});

document.querySelectorAll(".ai-risk-picker input").forEach((input) => {
  input.addEventListener("change", () => {
    if (!$("#developer-view-integration").hidden) renderIntegrationPrompt();
  });
});

document.querySelectorAll("[data-developer-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.developerView));
});

$("#developer-workspace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Saving...";
  try {
    await api("/api/developer/workspace", {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value })
    });
    status.textContent = "Workspace saved.";
    toast("Workspace saved");
    await loadWorkspace();
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-notification-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Saving...";
  const workspaceName = $("#developer-workspace-form")?.elements.name.value || state.workspace?.name || "Workspace";
  try {
    await api("/api/developer/workspace", {
      method: "POST",
      body: JSON.stringify({
        name: workspaceName,
        emailNotificationsEnabled: form.elements.emailNotificationsEnabled.checked,
        defaultReviewerEmails: form.elements.defaultReviewerEmails.value
      })
    });
    status.textContent = "Notification settings saved.";
    toast("Notification settings saved");
    await loadWorkspace();
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Saving...";
  try {
    const data = await api("/api/developer/profile", {
      method: "POST",
      body: JSON.stringify({
        name: form.elements.name.value,
        company: form.elements.company.value
      })
    });
    if (data.profile) {
      state.developer = { ...state.developer, ...data.profile };
    }
    status.textContent = "Profile saved.";
    toast("Profile saved");
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-api-key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Creating key...";
  try {
    const data = await api("/api/developer/api-key", {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value })
    });
    closeModal("#api-key-create-modal");
    state.lastApiKey = data.apiKey.key;
    track("api_key_created", { keyId: data.apiKey.id, prefix: data.apiKey.prefix });
    showApiKeyModal(data.apiKey.key);
    status.textContent = "API key created.";
    form.reset();
    await loadKeys();
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-key-search").addEventListener("input", (event) => {
  state.keySearch = event.target.value;
  renderKeys();
});

$("#developer-key-filter").addEventListener("change", (event) => {
  state.keyStatus = event.target.value;
  renderKeys();
});

$("#developer-audit-refresh").addEventListener("click", () => loadAudit().catch((error) => toast(error.message)));

$("#developer-audit-range").addEventListener("change", (event) => {
  state.auditRange = event.target.value;
  loadAudit().catch((error) => toast(error.message));
});

$("#developer-test-escalation").addEventListener("click", async () => {
  const button = $("#developer-test-escalation");
  button.disabled = true;
  button.textContent = "Creating...";
  try {
    const data = await api("/api/developer/test-escalation", { method: "POST", body: "{}" });
    toast("Test escalation created");
    track("escalation_created", { escalationId: data.escalationId, mode: "test" });
    state.status = "all";
    $("#developer-status-filter").value = "all";
    await loadEscalations();
    await loadDetail(data.escalationId);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Create test escalation";
  }
});

function openModal(selector) {
  const modal = $(selector);
  if (modal) modal.hidden = false;
}

function closeModal(selector) {
  const modal = $(selector);
  if (modal) modal.hidden = true;
}

$("#developer-create-agent").addEventListener("click", () => openModal("#agent-create-modal"));
$("#agent-create-modal-close").addEventListener("click", () => closeModal("#agent-create-modal"));
$("#developer-create-api-key").addEventListener("click", () => openModal("#api-key-create-modal"));
$("#api-key-create-modal-close").addEventListener("click", () => closeModal("#api-key-create-modal"));

function showApiKeyModal(key) {
  const modal = $("#api-key-modal");
  $("#api-key-modal-value").textContent = key;
  $("#api-key-modal-copy").dataset.copyKey = key;
  $("#api-key-modal-env").textContent = `FORSIG_API_KEY=${key}`;
  modal.hidden = false;
  renderQuickstart();
}

function closeApiKeyModal() {
  const modal = $("#api-key-modal");
  $("#api-key-modal-value").textContent = "";
  $("#api-key-modal-copy").dataset.copyKey = "";
  $("#api-key-modal-env").textContent = "";
  modal.hidden = true;
}

$("#api-key-modal-close").addEventListener("click", closeApiKeyModal);

$("#developer-agent-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Creating agent...";
  try {
    await api("/api/developer/agents", {
      method: "POST",
      body: JSON.stringify({
        name: form.elements.name.value,
        slug: form.elements.slug.value,
        environment: form.elements.environment.value,
        defaultReviewerEmails: form.elements.defaultReviewerEmails.value,
        description: form.elements.description.value
      })
    });
    status.textContent = "Agent created.";
    toast("Agent created");
    track("agent_created", { name: form.elements.name.value, environment: form.elements.environment.value });
    form.reset();
    closeModal("#agent-create-modal");
    await loadAgents();
  } catch (error) {
    status.textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-developer-view]");
  if (viewButton && !event.target.closest(".developer-sidebar")) {
    setView(viewButton.dataset.developerView);
    return;
  }

  if (event.target.closest("#developer-empty-test-escalation")) {
    $("#developer-test-escalation")?.click();
    return;
  }

  const checklistButton = event.target.closest("[data-checklist-view]");
  if (checklistButton) {
    setView(checklistButton.dataset.checklistView);
    return;
  }

  const quickstartTab = event.target.closest("[data-quickstart-tab]");
  if (quickstartTab) {
    state.quickstartTab = quickstartTab.dataset.quickstartTab;
    renderQuickstart();
    track("quickstart_tab_selected", { tab: state.quickstartTab });
    return;
  }

  const promptTool = event.target.closest("[data-prompt-tool]");
  if (promptTool) {
    state.promptTargetTool = promptTool.dataset.promptTool;
    renderIntegrationPrompt();
    track("integration_prompt_tool_selected", { targetTool: state.promptTargetTool });
    return;
  }

  if (event.target.closest("#developer-copy-quickstart")) {
    await navigator.clipboard.writeText($("#developer-quickstart-code").textContent);
    toast("Quickstart code copied");
    track("quickstart_code_copied", { tab: state.quickstartTab });
    return;
  }

  if (event.target.closest("#developer-generate-real-snippet")) {
    setView("quickstart");
    state.quickstartTab = "node";
    renderQuickstart();
    track("send_real_escalation_snippet_generated", {
      hasApiKey: Boolean(activeApiKey()),
      hasAgent: Boolean(starterAgent())
    });
    toast("Copy the quickstart code and run it locally");
    return;
  }

  if (event.target.closest("#developer-generate-ai-prompt")) {
    $("#developer-ai-prompt-output").textContent = generateAiInstallPrompt();
    track("ai_install_prompt_generated");
    toast("AI install prompt generated");
    return;
  }

  if (event.target.closest("#developer-copy-ai-prompt")) {
    await navigator.clipboard.writeText($("#developer-ai-prompt-output").textContent);
    track("ai_install_prompt_copied");
    toast("AI prompt copied");
    return;
  }

  if (event.target.closest("#developer-copy-ai-install")) {
    await navigator.clipboard.writeText(aiInstallCommand());
    track("ai_install_command_copied", { command: aiInstallCommand() });
    toast("Install command copied");
    return;
  }

  if (event.target.closest("#developer-open-quickstart-from-prompt")) {
    setView("quickstart");
    track("ai_install_opened_quickstart");
    return;
  }

  if (event.target.closest("[data-back-inbox]")) {
    showInboxList();
    return;
  }

  if (event.target.closest("[data-back-audit]")) {
    setView("audit");
    return;
  }

  if (event.target.closest("[data-back-agents]")) {
    showAgentList();
    return;
  }

  if (event.target.closest("[data-back-keys]")) {
    showKeyList();
    return;
  }

  const escalationButton = event.target.closest("[data-escalation-id]");
  if (escalationButton) {
    await loadDetail(escalationButton.dataset.escalationId);
    return;
  }

  const auditRow = event.target.closest("[data-audit-id]");
  if (auditRow) {
    showAuditDetail(auditRow.dataset.auditId);
    return;
  }

  const decisionButtonEl = event.target.closest("[data-decision-status]");
  if (decisionButtonEl) {
    const status = decisionButtonEl.dataset.decisionStatus;
    const form = $("#developer-decision-form");
    form.elements.status.value = status;
    const templates = {
      approved: "Proceed with the proposed action.",
      rejected: "Do not continue with this action.",
      edited: "Continue, but use this revised instruction:",
      context_added: "Use the added context and continue.",
      taken_over: "Human reviewer has taken over. Stop autonomous execution.",
      needs_more_info: "Gather more information and escalate again."
    };
    form.elements.instruction.value = templates[status] || "";
    document.querySelectorAll("[data-decision-status]").forEach((button) => button.classList.remove("active"));
    decisionButtonEl.classList.add("active");
  }

  const copy = event.target.closest("[data-copy-key]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copyKey);
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1200);
  }

  const hold = event.target.closest("[data-hold-key]");
  if (hold) {
    const shouldHold = hold.dataset.holdValue !== "false";
    hold.disabled = true;
    hold.textContent = shouldHold ? "Holding..." : "Unholding...";
    try {
      await api(`/api/developer/api-key/${encodeURIComponent(hold.dataset.holdKey)}/hold`, {
        method: "POST",
        body: JSON.stringify({ hold: shouldHold })
      });
      toast(shouldHold ? "API key held" : "API key unheld");
      await loadKeys();
    } catch (error) {
      toast(error.message);
      await loadKeys();
    }
    return;
  }

  const revoke = event.target.closest("[data-revoke-key]");
  if (revoke) {
    revoke.disabled = true;
    revoke.textContent = "Revoking...";
    try {
      await api(`/api/developer/api-key/${encodeURIComponent(revoke.dataset.revokeKey)}/revoke`, { method: "POST", body: "{}" });
      toast("API key revoked");
      await loadKeys();
    } catch (error) {
      toast(error.message);
      revoke.disabled = false;
      revoke.textContent = "Revoke";
    }
    return;
  }

  const archiveAgent = event.target.closest("[data-archive-agent]");
  if (archiveAgent) {
    const shouldArchive = archiveAgent.dataset.archiveValue !== "false";
    archiveAgent.disabled = true;
    archiveAgent.textContent = shouldArchive ? "Archiving..." : "Unarchiving...";
    try {
      await api(`/api/developer/agents/${encodeURIComponent(archiveAgent.dataset.archiveAgent)}`, {
        method: "POST",
        body: JSON.stringify({ archive: shouldArchive })
      });
      toast(shouldArchive ? "Agent archived" : "Agent unarchived");
      await loadAgents();
    } catch (error) {
      toast(error.message);
      archiveAgent.disabled = false;
      archiveAgent.textContent = shouldArchive ? "Archive" : "Unarchive";
    }
    return;
  }

  const agentRow = event.target.closest("[data-agent-id]");
  if (agentRow) {
    showAgentDetail(agentRow.dataset.agentId);
  }

  const apiKeyRow = event.target.closest("[data-api-key-id]");
  if (apiKeyRow && !event.target.closest(".row-actions")) {
    showKeyDetail(apiKeyRow.dataset.apiKeyId);
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "developer-decision-form") {
    event.preventDefault();
    await submitDecision(event.target).catch((error) => {
      event.target.querySelector(".mini-status").textContent = error.message;
    });
  }
});

checkSession().catch((error) => {
  showLogin();
  $("#developer-login-form .mini-status").textContent = error.message;
});
