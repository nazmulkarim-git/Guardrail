const state = {
  selectedId: new URLSearchParams(location.search).get("esc"),
  status: "pending",
  escalations: [],
  detail: null,
  developer: null,
  setupRequired: false
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
  $("#developer-app").hidden = true;
  $("#developer-reset-password-form").hidden = true;
}

function showApp() {
  $("#developer-sidebar").hidden = false;
  $("#developer-login").hidden = true;
  $("#developer-app").hidden = false;
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
}

async function checkSession() {
  const session = await api("/api/developer/me");
  if (session.authenticated) {
    state.developer = session.developer;
    if (session.developer.mustResetPassword) {
      showLogin();
      $("#developer-login-form").hidden = true;
      $("#developer-reset-password-form").hidden = false;
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
    list.innerHTML = data.keys.length ? data.keys.map((key) => `
      <article>
        <strong>${escapeHtml(key.name)}</strong>
        <span>${escapeHtml(key.prefix || key.id)} · created ${formatDate(key.created_at)}</span>
        <small>${key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : "Never used"}</small>
        ${key.revoked_at ? `<em>Revoked ${formatDate(key.revoked_at)}</em>` : `<button type="button" data-revoke-key="${escapeHtml(key.id)}">Revoke</button>`}
      </article>
    `).join("") : "<p class='empty-state'>No API keys yet.</p>";
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
        ${agent.archived_at ? `<em>Archived ${formatDate(agent.archived_at)}</em>` : `<button type="button" data-archive-agent="${escapeHtml(agent.id)}">Archive</button>`}
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
    <div class="detail-head">
      <span>${escapeHtml(item.status)}</span>
      <h2>${escapeHtml(item.task?.title)}</h2>
      <p>${escapeHtml(item.agent?.name || item.agent?.id)} · ${escapeHtml(item.risk?.type)} · ${formatDate(item.createdAt)}</p>
      <p>${item.reviewer?.assignedEmail ? `Assigned to ${escapeHtml(item.reviewer.assignedEmail)} · ` : ""}${item.expiresAt ? `Expires ${formatDate(item.expiresAt)} · ` : ""}${item.testMode ? `Mode: ${escapeHtml(item.testMode)}` : "Mode: manual"}</p>
    </div>

    <section class="detail-snapshot">
      <article>
        <span>Agent wants to</span>
        <strong>${escapeHtml(item.task?.proposedAction)}</strong>
      </article>
      <article>
        <span>Risk</span>
        <strong>${escapeHtml(item.risk?.level || "review")} / ${escapeHtml(item.risk?.type || "unknown")}</strong>
      </article>
      <article>
        <span>Reason</span>
        <strong>${escapeHtml(item.risk?.reason || "Human review requested.")}</strong>
      </article>
    </section>

    <section class="detail-section">
      <h3>Context</h3>
      <pre><code>${escapeHtml(prettyJson(item.context))}</code></pre>
    </section>

    <section class="detail-section">
      <h3>Decision</h3>
      <p class="section-helper">Choose what Forsig should return to your agent. In production, your workflow reads this decision and continues, stops, or asks for more context.</p>
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
        <p>${escapeHtml(item.decision?.instruction || "Decision recorded.")}</p>
      `}
    </section>

    <section class="detail-section">
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

$("#developer-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Checking...";
  try {
    const payload = {
      email: form.elements.email.value,
      accessCode: form.elements.accessCode.value,
      password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value
    };
    if (state.setupRequired && !payload.password) {
      status.textContent = "Create a password to finish setup.";
      form.elements.confirmPassword.hidden = false;
      form.elements.password.focus();
      return;
    }
    const data = await api("/api/developer/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (data.setupRequired) {
      state.setupRequired = true;
      status.textContent = data.message || "Create a password to finish opening your beta workspace.";
      $("#developer-login-copy").textContent = "Create your password. Next time you will log in with email and password.";
      form.elements.confirmPassword.hidden = false;
      form.elements.accessCode.required = true;
      form.elements.password.required = true;
      form.elements.confirmPassword.required = true;
      form.elements.password.placeholder = "Create password";
      form.elements.password.autocomplete = "new-password";
      form.elements.password.focus();
      return;
    }
    state.developer = data.developer;
    status.textContent = "";
    state.setupRequired = false;
    if (data.mustResetPassword || data.developer?.mustResetPassword) {
      $("#developer-login-form").hidden = true;
      $("#developer-reset-password-form").hidden = false;
      return;
    }
    $("#developer-login-form").hidden = false;
    $("#developer-reset-password-form").hidden = true;
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
    await api("/api/developer/password", {
      method: "POST",
      body: JSON.stringify({
        password: form.elements.password.value,
        confirmPassword: form.elements.confirmPassword.value
      })
    });
    status.textContent = "";
    toast("Password updated");
    $("#developer-login-form").hidden = false;
    $("#developer-reset-password-form").hidden = true;
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
    const box = $("#developer-new-api-key");
    box.hidden = false;
    box.innerHTML = `
      <span>Copy this key now. It will not be shown again.</span>
      <code>${escapeHtml(data.apiKey.key)}</code>
      <button type="button" data-copy-key="${escapeHtml(data.apiKey.key)}">Copy</button>
    `;
    status.textContent = "API key created.";
    form.reset();
    await loadKeys();
  } catch (error) {
    status.textContent = error.message;
  }
});

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
    archiveAgent.disabled = true;
    archiveAgent.textContent = "Archiving...";
    try {
      await api(`/api/developer/agents/${encodeURIComponent(archiveAgent.dataset.archiveAgent)}`, {
        method: "POST",
        body: JSON.stringify({ archive: true })
      });
      toast("Agent archived");
      await loadAgents();
    } catch (error) {
      toast(error.message);
      archiveAgent.disabled = false;
      archiveAgent.textContent = "Archive";
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
