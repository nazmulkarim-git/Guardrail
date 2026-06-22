const state = {
  selectedId: new URLSearchParams(location.search).get("esc"),
  status: "pending",
  escalations: [],
  detail: null,
  developer: null,
  setupRequired: false,
  authMode: "signup",
  keys: [],
  keyStatus: "all",
  keySearch: "",
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
  if (view === "keys") loadKeys();
  if (view === "workspace") loadWorkspace();
  if (view === "agents") loadAgents();
  if (view === "profile") loadProfile();
  if (view === "audit") loadAudit();
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
    $("#developer-workspace-label").textContent = `${session.developer.workspaceName || "Workspace"} · ${session.developer.email}`;
    await Promise.all([loadWorkspace(), loadEscalations()]);
    if (state.selectedId) await loadDetail(state.selectedId);
  } else {
    showLogin();
  }
}

async function loadWorkspace() {
  try {
    const data = await api("/api/developer/workspace");
    const form = $("#developer-workspace-form");
    if (data.workspace && form) {
      form.elements.name.value = data.workspace.name || "";
      if (state.developer) state.developer.workspaceName = data.workspace.name || "Workspace";
      $("#developer-workspace-label").textContent = `${data.workspace.name || "Workspace"} · ${state.developer?.email || ""}`;
    }
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
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

function keyStatus(key) {
  if (key.revoked_at) return "revoked";
  if (key.held_at) return "held";
  return "active";
}

function renderKeys() {
  const list = $("#developer-api-key-list");
  const query = state.keySearch.trim().toLowerCase();
  const keys = state.keys.filter((key) => {
    const status = keyStatus(key);
    const matchesStatus = state.keyStatus === "all" || state.keyStatus === status;
    const matchesQuery = !query || `${key.name} ${key.prefix}`.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });
  if (!keys.length) {
    list.innerHTML = "<p class='empty-state'>No API keys match this view.</p>";
    return;
  }
  list.innerHTML = `
    <div class="resend-table-row resend-table-head">
      <span>Name</span><span>Token</span><span>Status</span><span>Last used</span><span>Created</span><span></span>
    </div>
    ${keys.map((key) => {
      const status = keyStatus(key);
      return `
        <div class="resend-table-row">
          <span><b>${escapeHtml(key.name)}</b></span>
          <span><code>${escapeHtml(key.prefix || key.id)}</code></span>
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
    state.auditEvents = data.events || [];
    list.innerHTML = state.auditEvents.length ? `
      <div class="resend-table-row resend-table-head">
        <span>Event</span><span>Target</span><span>Actor</span><span>Time</span>
      </div>
      ${state.auditEvents.map((event) => `
        <div class="resend-table-row audit-row">
          <span><b>${escapeHtml(event.event_type)}</b><small>${escapeHtml(JSON.stringify(event.metadata_json || {}))}</small></span>
          <span>${escapeHtml(event.task_title || event.escalation_id || "Workspace")}</span>
          <span>${escapeHtml(event.actor_type)} · ${escapeHtml(event.actor_id || "-")}</span>
          <span>${formatDate(event.created_at)}</span>
        </div>
      `).join("")}
    ` : "<p class='empty-state'>No audit events yet.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
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

async function loadAgents() {
  const list = $("#developer-agent-list");
  list.innerHTML = "<p class='empty-state'>Loading agents...</p>";
  try {
    const data = await api("/api/developer/agents");
    list.innerHTML = data.agents.length ? data.agents.map((agent) => `
      <article>
        <strong>${escapeHtml(agent.name)}</strong>
        <span>${escapeHtml(agent.slug)} &middot; ${escapeHtml(agent.environment)} &middot; ${agent.escalation_count || 0} escalations</span>
        <small>${escapeHtml(agent.description || "No description yet.")}</small>
        <pre><code>${escapeHtml(agentSnippet(agent))}</code></pre>
        <button type="button" data-copy-key="${escapeHtml(agentSnippet(agent))}">Copy snippet</button>
        ${agent.archived_at ? `<em>Archived ${formatDate(agent.archived_at)}</em><button type="button" data-archive-agent="${escapeHtml(agent.id)}" data-archive-value="false">Unarchive</button>` : `<button type="button" data-archive-agent="${escapeHtml(agent.id)}" data-archive-value="true">Archive</button>`}
      </article>
    `).join("") : "<p class='empty-state'>No agents yet. Create one, then send a test escalation.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

async function loadEscalations() {
  const data = await api(`/api/developer/escalations?status=${encodeURIComponent(state.status)}`);
  state.escalations = data.escalations || [];
  $("#dev-stat-pending").textContent = data.counts?.pending ?? 0;
  $("#dev-stat-approved").textContent = data.counts?.approved ?? 0;
  $("#dev-stat-rejected").textContent = data.counts?.rejected ?? 0;
  $("#dev-stat-edited").textContent = data.counts?.edited ?? 0;
  renderList();
  if (!state.selectedId && state.escalations[0]) {
    await loadDetail(state.escalations[0].id);
  }
}

function renderList() {
  const list = $("#developer-escalation-list");
  if (!state.escalations.length) {
    list.innerHTML = "<p class='empty-state'>No escalations yet. Create an agent, create an API key, then click Send test escalation to see the full loop.</p>";
    return;
  }
  list.innerHTML = state.escalations.map((item) => `
    <button type="button" data-escalation-id="${escapeHtml(item.id)}" class="${item.id === state.selectedId ? "active" : ""}">
      <span>${escapeHtml(item.risk?.level || "review")}</span>
      <strong>${escapeHtml(item.task?.title || item.id)}</strong>
      <small>${escapeHtml(item.agent?.name || item.agent?.id || "Agent")} · ${escapeHtml(item.risk?.type || "risk")}</small>
      ${item.reviewer?.assignedEmail ? `<small>Reviewer: ${escapeHtml(item.reviewer.assignedEmail)}</small>` : ""}
      <em>${escapeHtml(item.status)}</em>
    </button>
  `).join("");
}

async function loadDetail(id) {
  state.selectedId = id;
  const data = await api(`/api/developer/escalations/${encodeURIComponent(id)}`);
  state.detail = data;
  history.replaceState(null, "", `/developer?esc=${encodeURIComponent(id)}`);
  renderList();
  renderDetail();
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
      <div class="product-review-header">
        <div class="zip-risk-icon">!</div>
        <div>
          <h2>${escapeHtml(item.task?.title)}</h2>
          <p>${escapeHtml(item.task?.description || "The agent is waiting for human judgment before it continues.")}</p>
        </div>
        <span>${escapeHtml(item.status)}</span>
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
      <p class="section-helper">${item.reviewer?.assignedEmail ? `Assigned to ${escapeHtml(item.reviewer.assignedEmail)}. ` : ""}${item.expiresAt ? `Expires ${formatDate(item.expiresAt)}. ` : ""}${item.testMode ? `Mode: ${escapeHtml(item.testMode)}.` : "Mode: manual."}</p>
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
              <span>${formatDate(event.created_at)} · ${escapeHtml(event.actor_type)}</span>
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
    await Promise.all([loadWorkspace(), loadEscalations()]);
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
    await Promise.all([loadWorkspace(), loadEscalations()]);
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#developer-logout").addEventListener("click", async () => {
  await api("/api/developer/logout", { method: "POST", body: "{}" }).catch(() => null);
  showLogin();
});

$("#developer-refresh").addEventListener("click", () => loadEscalations().catch((error) => toast(error.message)));

$("#developer-test-escalation").addEventListener("click", async () => {
  const button = $("#developer-test-escalation");
  button.disabled = true;
  button.textContent = "Creating...";
  try {
    const data = await api("/api/developer/test-escalation", { method: "POST", body: "{}" });
    toast("Test escalation created");
    state.status = "pending";
    $("#developer-status-filter").value = "pending";
    await loadEscalations();
    await loadDetail(data.escalationId);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Send test escalation";
  }
});

$("#developer-status-filter").addEventListener("change", async (event) => {
  state.status = event.target.value;
  state.selectedId = null;
  await loadEscalations();
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

function showApiKeyModal(key) {
  const modal = $("#api-key-modal");
  $("#api-key-modal-value").textContent = key;
  $("#api-key-modal-copy").dataset.copyKey = key;
  modal.hidden = false;
}

function closeApiKeyModal() {
  const modal = $("#api-key-modal");
  $("#api-key-modal-value").textContent = "";
  $("#api-key-modal-copy").dataset.copyKey = "";
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
    form.reset();
    await loadAgents();
  } catch (error) {
    status.textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const escalationButton = event.target.closest("[data-escalation-id]");
  if (escalationButton) {
    await loadDetail(escalationButton.dataset.escalationId);
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
