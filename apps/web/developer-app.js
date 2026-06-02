const state = {
  selectedId: new URLSearchParams(location.search).get("esc"),
  status: "pending",
  escalations: [],
  detail: null,
  developer: null
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
}

async function checkSession() {
  const session = await api("/api/developer/me");
  if (session.authenticated) {
    state.developer = session.developer;
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
      </article>
    `).join("") : "<p class='empty-state'>No API keys yet.</p>";
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
    list.innerHTML = "<p class='empty-state'>No escalations in this view yet.</p>";
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
    </div>

    <section class="detail-section">
      <h3>Proposed action</h3>
      <p>${escapeHtml(item.task?.proposedAction)}</p>
      ${item.risk?.reason ? `<small>${escapeHtml(item.risk.reason)}</small>` : ""}
    </section>

    <section class="detail-section">
      <h3>Context</h3>
      <pre><code>${escapeHtml(prettyJson(item.context))}</code></pre>
    </section>

    <section class="detail-section">
      <h3>Decision</h3>
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
    const data = await api("/api/developer/login", {
      method: "POST",
      body: JSON.stringify({
        email: form.elements.email.value,
        accessCode: form.elements.accessCode.value
      })
    });
    state.developer = data.developer;
    status.textContent = "";
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
