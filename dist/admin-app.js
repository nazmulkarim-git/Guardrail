const state = {
  selectedId: new URLSearchParams(location.search).get("esc"),
  status: "pending",
  escalations: [],
  detail: null
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
  $("#admin-sidebar").hidden = true;
  $("#admin-login").hidden = false;
  $("#admin-app").hidden = true;
}

function showApp() {
  $("#admin-sidebar").hidden = false;
  $("#admin-login").hidden = true;
  $("#admin-app").hidden = false;
}

function setView(view) {
  document.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminView === view);
  });
  document.querySelectorAll(".admin-view").forEach((section) => {
    section.hidden = section.id !== `admin-view-${view}`;
  });
  if (view === "keys") loadKeys();
  if (view === "onboarding") loadWorkspace();
  if (view === "developers") loadDevelopers();
  if (view === "waitlist") loadWaitlist();
}

async function checkSession() {
  const session = await api("/api/admin/me");
  if (session.authenticated) {
    showApp();
    await Promise.all([loadWorkspace(), loadEscalations()]);
    if (state.selectedId) await loadDetail(state.selectedId);
  } else {
    showLogin();
  }
}

async function loadWorkspace() {
  try {
    const data = await api("/api/admin/workspace");
    const form = $("#workspace-form");
    if (data.workspace && form) {
      form.elements.name.value = data.workspace.name || "";
      form.elements.ownerEmail.value = data.workspace.owner_email || "";
    }
  } catch (error) {
    $("#workspace-form .mini-status").textContent = error.message;
  }
}

async function loadKeys() {
  const list = $("#api-key-list");
  list.innerHTML = "<p class='empty-state'>Loading keys...</p>";
  try {
    const data = await api("/api/admin/api-key");
    list.innerHTML = data.keys.length ? data.keys.map((key) => `
      <article>
        <strong>${escapeHtml(key.name)}</strong>
        <span>${escapeHtml(key.prefix || key.id)} · created ${formatDate(key.created_at)}</span>
        <small>${key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : "Never used"}</small>
      </article>
    `).join("") : "<p class='empty-state'>No API keys yet.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

async function loadDevelopers() {
  const list = $("#developer-list");
  list.innerHTML = "<p class='empty-state'>Loading developers...</p>";
  try {
    const data = await api("/api/admin/developers");
    list.innerHTML = data.developers.length ? data.developers.map((developer) => `
      <article>
        <strong>${escapeHtml(developer.name || developer.email)}</strong>
        <span>${escapeHtml(developer.email)} · ${escapeHtml(developer.workspace_name || developer.workspace_id)}</span>
        <small>${developer.escalation_count || 0} escalations · ${developer.agent_count || 0} agents · ${developer.active_key_count || 0} active keys · ${developer.last_login_at ? `last login ${formatDate(developer.last_login_at)}` : "not logged in yet"}</small>
        <small>${developer.password_set_at ? "Password set" : "Awaiting first login"}${developer.must_reset_password ? " · temporary password active" : ""}</small>
        ${(developer.agents || []).length ? `<div class="mini-list">${developer.agents.map((agent) => `<span>${escapeHtml(agent.name)} / ${escapeHtml(agent.environment)} / ${agent.escalationCount || 0} escalations</span>`).join("")}</div>` : ""}
      </article>
    `).join("") : "<p class='empty-state'>No developers have beta access yet.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

async function loadWaitlist() {
  const list = $("#waitlist-lead-list");
  list.innerHTML = "<p class='empty-state'>Loading waitlist...</p>";
  try {
    const data = await api("/api/admin/waitlist");
    list.innerHTML = data.leads.length ? data.leads.map((lead) => `
      <article>
        <strong>${escapeHtml(lead.name || lead.email)}</strong>
        <span>${escapeHtml(lead.email)}${lead.company ? ` · ${escapeHtml(lead.company)}` : ""}${lead.role ? ` · ${escapeHtml(lead.role)}` : ""}</span>
        <small>${escapeHtml(lead.use_case || "No use case yet.")}</small>
        <small>${escapeHtml(lead.framework_interest || "Framework unknown")} · ${escapeHtml(lead.external_actions || "Actions unknown")} · ${escapeHtml(lead.founder_call_interest || "Call interest unknown")}</small>
        <small>Source: ${escapeHtml(lead.source_section || lead.source || "unknown")} · ${formatDate(lead.created_at)}</small>
        ${lead.has_beta_access ? "<em>Beta access granted</em>" : `<button type="button" data-invite-lead="${escapeHtml(lead.id)}">Send beta access</button>`}
      </article>
    `).join("") : "<p class='empty-state'>No waitlist leads yet.</p>";
  } catch (error) {
    list.innerHTML = `<p class='empty-state'>${escapeHtml(error.message)}</p>`;
  }
}

async function loadEscalations() {
  const data = await api(`/api/admin/escalations?status=${encodeURIComponent(state.status)}`);
  state.escalations = data.escalations || [];
  $("#stat-pending").textContent = data.counts?.pending ?? 0;
  $("#stat-approved").textContent = data.counts?.approved ?? 0;
  $("#stat-rejected").textContent = data.counts?.rejected ?? 0;
  $("#stat-edited").textContent = data.counts?.edited ?? 0;
  renderList();
  if (!state.selectedId && state.escalations[0]) {
    await loadDetail(state.escalations[0].id);
  }
}

function renderList() {
  const list = $("#escalation-list");
  if (!state.escalations.length) {
    list.innerHTML = "<p class='empty-state'>No escalations yet. Invite a developer, ask them to create an API key, then send a test escalation.</p>";
    return;
  }
  list.innerHTML = state.escalations.map((item) => `
    <button type="button" data-escalation-id="${escapeHtml(item.id)}" class="${item.id === state.selectedId ? "active" : ""}">
      <span>${escapeHtml(item.risk?.level || "review")}</span>
      <strong>${escapeHtml(item.task?.title || item.id)}</strong>
      <small>${escapeHtml(item.agent?.name || item.agent?.id || "Agent")} · ${escapeHtml(item.risk?.type || "risk")}</small>
      <em>${escapeHtml(item.status)}</em>
    </button>
  `).join("");
}

async function loadDetail(id) {
  state.selectedId = id;
  const data = await api(`/api/admin/escalations/${encodeURIComponent(id)}`);
  state.detail = data;
  history.replaceState(null, "", `/app?esc=${encodeURIComponent(id)}`);
  renderList();
  renderDetail();
}

function decisionButton(status, label) {
  return `<button type="button" data-decision-status="${status}">${label}</button>`;
}

function renderDetail() {
  const detail = $("#escalation-detail");
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
      <p class="section-helper">Choose the instruction Forsig should return to the agent. This is the handback point in the workflow.</p>
      ${canDecide ? `
        <div class="decision-actions">
          ${decisionButton("approved", "Approve")}
          ${decisionButton("rejected", "Reject")}
          ${decisionButton("edited", "Edit")}
          ${decisionButton("context_added", "Add context")}
          ${decisionButton("taken_over", "Take over")}
          ${decisionButton("needs_more_info", "More info")}
        </div>
        <form id="decision-form" class="decision-form">
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
  const status = form.elements.status.value;
  const payload = {
    status,
    instruction: form.elements.instruction.value.trim(),
    comment: form.elements.comment.value.trim(),
    reviewerName: "Admin reviewer",
    reviewerChannel: "dashboard"
  };
  const statusEl = form.querySelector(".mini-status");
  statusEl.textContent = "Sending decision...";
  await api(`/api/admin/escalations/${encodeURIComponent(state.selectedId)}/decision`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  toast("Decision sent");
  statusEl.textContent = "Decision sent.";
  await loadEscalations();
  await loadDetail(state.selectedId);
}

$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Checking...";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: form.elements.password.value })
    });
    status.textContent = "";
    showApp();
    await Promise.all([loadWorkspace(), loadEscalations()]);
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#admin-logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => null);
  showLogin();
});

$("#admin-refresh").addEventListener("click", () => loadEscalations().catch((error) => toast(error.message)));

$("#admin-status-filter").addEventListener("change", async (event) => {
  state.status = event.target.value;
  state.selectedId = null;
  await loadEscalations();
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
    const form = $("#decision-form");
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
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "decision-form") {
    event.preventDefault();
    await submitDecision(event.target).catch((error) => {
      event.target.querySelector(".mini-status").textContent = error.message;
    });
  }
});

document.querySelectorAll("[data-admin-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.adminView));
});

$("#workspace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Saving...";
  try {
    await api("/api/admin/workspace", {
      method: "POST",
      body: JSON.stringify({
        name: form.elements.name.value,
        ownerEmail: form.elements.ownerEmail.value
      })
    });
    status.textContent = "Workspace saved.";
    toast("Workspace saved");
  } catch (error) {
    status.textContent = error.message;
  }
});

$("#api-key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Creating key...";
  try {
    const data = await api("/api/admin/api-key", {
      method: "POST",
      body: JSON.stringify({ name: form.elements.name.value })
    });
    const box = $("#new-api-key");
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

$("#developer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".mini-status");
  status.textContent = "Creating access...";
  try {
    const data = await api("/api/admin/developers", {
      method: "POST",
      body: JSON.stringify({
        email: form.elements.email.value,
        name: form.elements.name.value,
        company: form.elements.company.value,
        workspaceName: form.elements.workspaceName.value
      })
    });
    const loginUrl = `${location.origin}${data.developer.loginUrl}`;
    const inviteText = [
      `Forsig developer portal: ${loginUrl}`,
      `Email: ${data.developer.email}`,
      `Access code: ${data.developer.accessCode}`
    ].join("\n");
    const box = $("#new-developer-access");
    box.hidden = false;
    box.innerHTML = `
      <span>${data.inviteEmail?.sent ? "Invite email sent. The access code is also shown once below." : "Invite email was not sent. Share this access manually."}</span>
      <code>${escapeHtml(inviteText)}</code>
      <button type="button" data-copy-key="${escapeHtml(inviteText)}">Copy</button>
    `;
    status.textContent = "Developer access created.";
    form.reset();
    await loadDevelopers();
  } catch (error) {
    status.textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const inviteLead = event.target.closest("[data-invite-lead]");
  if (inviteLead) {
    inviteLead.disabled = true;
    inviteLead.textContent = "Sending...";
    try {
      const data = await api("/api/admin/waitlist", {
        method: "POST",
        body: JSON.stringify({ leadId: inviteLead.dataset.inviteLead })
      });
      const loginUrl = `${location.origin}${data.developer.loginUrl}`;
      const inviteText = [
        `Forsig developer portal: ${loginUrl}`,
        `Email: ${data.developer.email}`,
        `Access code: ${data.developer.accessCode}`
      ].join("\n");
      const box = $("#waitlist-new-developer-access") || $("#new-developer-access");
      if (box) {
        box.hidden = false;
        box.innerHTML = `
          <span>${data.developer.inviteEmail?.sent ? "Invite email sent. The access code is also shown once below." : "Invite email was not sent. Share this access manually."}</span>
          <code>${escapeHtml(inviteText)}</code>
          <button type="button" data-copy-key="${escapeHtml(inviteText)}">Copy</button>
        `;
      }
      toast("Beta access created");
      await Promise.all([loadWaitlist(), loadDevelopers()]);
    } catch (error) {
      toast(error.message);
      inviteLead.disabled = false;
      inviteLead.textContent = "Send beta access";
    }
    return;
  }

  const copy = event.target.closest("[data-copy-key]");
  if (!copy) return;
  await navigator.clipboard.writeText(copy.dataset.copyKey);
  copy.textContent = "Copied";
  setTimeout(() => (copy.textContent = "Copy"), 1200);
});

checkSession().catch((error) => {
  showLogin();
  $("#admin-login-form .mini-status").textContent = error.message;
});
