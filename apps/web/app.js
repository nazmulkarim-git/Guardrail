const analyticsConfig = {
  posthogKey: "",
  posthogHost: "https://app.posthog.com",
  loaded: false
};

function track(event, properties = {}) {
  const payload = {
    page: document.body.dataset.page,
    path: location.pathname,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ...utmProperties(),
    ...properties
  };
  window.forsigEvents = window.forsigEvents || [];
  window.forsigEvents.push({ event, properties: payload, at: new Date().toISOString() });
  if (window.posthog?.capture) window.posthog.capture(event, payload);
}

function showToast(message) {
  let toast = document.getElementById("forsig-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "forsig-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 1800);
}

function utmProperties() {
  const params = new URLSearchParams(location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    referralCode: params.get("ref"),
    referrer: document.referrer || null
  };
}

function prefillReferralCodes() {
  const referral = new URLSearchParams(location.search).get("ref");
  if (!referral) return;
  document.querySelectorAll('input[name="referralCode"]').forEach((input) => {
    input.value = referral;
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    analyticsConfig.posthogKey = config.posthogKey || "";
    analyticsConfig.posthogHost = config.posthogHost || "https://app.posthog.com";
  } catch {
    analyticsConfig.posthogKey = "";
  }
}

async function initPostHog() {
  await loadRuntimeConfig();
  if (!analyticsConfig.posthogKey || analyticsConfig.loaded) return;
  analyticsConfig.loaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `${analyticsConfig.posthogHost}/static/array.js`;
  script.onload = () => {
    window.posthog?.init(analyticsConfig.posthogKey, {
      api_host: analyticsConfig.posthogHost,
      autocapture: true,
      capture_pageview: false,
      session_recording: { maskAllInputs: true }
    });
    track(`${document.body.dataset.page}_viewed`);
  };
  document.head.appendChild(script);
}

function revealOnScroll() {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function initCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.copy);
      button.textContent = "Copied";
      track("code_snippet_copied", { copyType: "install_command" });
      setTimeout(() => (button.textContent = button.dataset.copy), 1200);
    });
  });

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      await copyText(target?.textContent || "");
      button.textContent = "Copied";
      track("code_snippet_copied", { copyType: button.dataset.copyTarget });
      setTimeout(() => (button.textContent = "Copy"), 1200);
    });
  });
}

function initHeroSwap() {
  const code = document.getElementById("hero-code");
  if (!code) return;
  const before = 'forsig.intervene({ risk: "refund_over_limit" })';
  const after = 'decision.status === "edited_approved"';
  let useAfter = false;
  setInterval(() => {
    useAfter = !useAfter;
    code.textContent = useAfter ? after : before;
  }, 2200);
}

function initConsoleMotion() {
  const title = document.getElementById("decision-title");
  const pill = document.getElementById("decision-pill");
  const agent = document.getElementById("decision-agent");
  const fill = document.getElementById("approval-fill");
  const reason = document.getElementById("decision-reason");
  const reviewer = document.getElementById("metric-reviewer");
  const responseTime = document.getElementById("metric-cost");
  const policy = document.getElementById("metric-policy");
  if (!title || !pill || !agent || !fill || !reason || !reviewer || !responseTime || !policy) return;

  const states = [
    {
      title: "Refund over limit",
      pill: "pending",
      agent: "Refund Agent",
      fill: "68%",
      reason: 'Proposed action: <strong>Issue $500 refund</strong>. Waiting for a human reviewer before the agent continues.',
      reviewer: "Support lead",
      responseTime: "2m 14s",
      policy: "pending",
      danger: true
    },
    {
      title: "Edited instruction",
      pill: "edited",
      agent: "Sales Agent",
      fill: "52%",
      reason: 'Reviewer changed the instruction to <strong>send a 10% offer</strong> instead of 25%.',
      reviewer: "Sales manager",
      responseTime: "1m 03s",
      policy: "edited",
      danger: false
    },
    {
      title: "Deployment action rejected",
      pill: "rejected",
      agent: "Deploy Agent",
      fill: "86%",
      reason: 'Reviewer rejected <strong>production migration</strong> until staging proof is attached.',
      reviewer: "Engineering lead",
      responseTime: "4m 22s",
      policy: "rejected",
      danger: true
    }
  ];

  let index = 0;
  setInterval(() => {
    index = (index + 1) % states.length;
    const state = states[index];
    title.textContent = state.title;
    pill.textContent = state.pill;
    agent.textContent = state.agent;
    fill.style.width = state.fill;
    reason.innerHTML = state.reason;
    reviewer.textContent = state.reviewer;
    responseTime.textContent = state.responseTime;
    policy.textContent = state.policy;
    pill.style.borderColor = state.danger ? "rgba(255, 113, 95, 0.35)" : "rgba(120, 242, 194, 0.35)";
    pill.style.color = state.danger ? "#ffd4ca" : "#d7ffe9";
    pill.style.background = state.danger ? "rgba(255, 113, 95, 0.12)" : "rgba(120, 242, 194, 0.1)";
  }, 2800);
}

function initImpactCalculator() {
  const requests = document.getElementById("calc-requests");
  const cost = document.getElementById("calc-cost");
  const total = document.getElementById("calc-total");
  const requestLabel = document.getElementById("calc-requests-label");
  const costLabel = document.getElementById("calc-cost-label");
  if (!requests || !cost || !total || !requestLabel || !costLabel) return;

  const update = () => {
    const confidence = Number(requests.value);
    const impact = Number(cost.value);
    const needsHuman = confidence < 60 || impact > 65;
    total.textContent = needsHuman ? "Human needed" : "Agent can continue";
    requestLabel.textContent = `${confidence}% confidence`;
    costLabel.textContent = impact > 70 ? "high impact" : impact > 35 ? "medium impact" : "low impact";
  };

  requests.addEventListener("input", update);
  cost.addEventListener("input", update);
  update();
}

function initWaitlist() {
  const forms = [
    { form: document.getElementById("hero-waitlist-form"), status: document.querySelector("#hero-waitlist-form .mini-status"), sourceSection: "hero_waitlist" },
    { form: document.getElementById("waitlist-form"), status: document.getElementById("form-status"), sourceSection: "landing_waitlist" },
    { form: document.getElementById("dashboard-waitlist-form"), status: document.querySelector("#dashboard-waitlist-form .mini-status"), sourceSection: "dashboard_waitlist" }
  ].filter((entry) => entry.form);

  for (const entry of forms) {
    entry.form.addEventListener("focusin", () => track("waitlist_form_started", { sourceSection: entry.sourceSection }), { once: true });
    entry.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      entry.status.textContent = "Submitting...";
      const data = Object.fromEntries(new FormData(entry.form).entries());
      track("waitlist_signup_submitted", { ...data, sourceSection: entry.sourceSection });

      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...data,
            ...utmProperties(),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            sourceSection: entry.sourceSection
          })
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Signup failed.");
        track("waitlist_signup_succeeded", { ...data, leadId: result.leadId, duplicate: result.duplicate, sourceSection: entry.sourceSection });
        if (result.duplicate) {
          entry.status.textContent = result.message || "This email is already registered for early access.";
          showToast("Already registered");
          return;
        }
        showToast("You are on the waitlist");
        const params = new URLSearchParams({
          lead: result.leadId,
          code: result.referralCode || ""
        });
        location.href = `/thanks?${params.toString()}`;
      } catch (error) {
        entry.status.textContent = error.message || "Something went wrong.";
        track("waitlist_signup_failed", { message: entry.status.textContent, sourceSection: entry.sourceSection });
      }
    });
  }
}

function initDashboard() {
  const pause = document.getElementById("pause-toggle");
  const status = document.getElementById("agent-status");
  const pendingCount = document.getElementById("pending-count");
  const escalationMeter = document.getElementById("escalation-meter");
  const blockedCount = document.getElementById("blocked-count");
  const decisionTime = document.getElementById("decision-time");
  const logBody = document.getElementById("demo-log-body");
  const logFilters = document.querySelectorAll(".log-filters button");
  const codeTitle = document.getElementById("demo-code-title");
  const codeBlock = document.getElementById("dash-js");
  const editPanel = document.getElementById("edit-instruction-panel");
  const editInput = document.getElementById("edit-instruction");
  const sendEdit = document.getElementById("send-edit-instruction");
  if (!status) return;
  let activeLogFilter = "all";

  const rows = {
    approved: ["12:21", "approved", "Approved as written", "audit_R7x2"],
    rejected: ["12:22", "rejected", "Needs proof before action", "audit_D4m8"],
    edited: ["12:23", "edited", "Offer store credit instead", "audit_E9q1"],
    expired: ["12:24", "expired", "Reviewer timeout", "audit_X5p0"],
    context_added: ["12:25", "context_added", "Added missing policy context", "audit_C7v4"],
    taken_over: ["12:26", "taken_over", "Human took over", "audit_H3p9"],
    needs_more_info: ["12:27", "needs_more_info", "Fetch last three invoices", "audit_M8r2"]
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function auditId() {
    return `audit_${Math.random().toString(36).slice(2, 6)}`;
  }

  function setCode(title, code) {
    if (codeTitle) codeTitle.textContent = title;
    if (codeBlock) codeBlock.textContent = code;
  }

  function decisionCode(type, instruction, id = auditId()) {
    return `{
  "status": "${type}",
  "instruction": ${JSON.stringify(instruction)},
  "auditId": "${id}"
}`;
  }

  function capAuditRows() {
    if (!logBody) return;
    const rows = [...logBody.querySelectorAll("tr")];
    rows.slice(10).forEach((row) => row.remove());
  }

  function prependLog(type) {
    if (!logBody) return;
    if (!rows[type]) return;
    const tr = document.createElement("tr");
    tr.className = "flash-row";
    tr.dataset.logType = type;
    tr.innerHTML = rows[type].map((cell) => `<td>${cell}</td>`).join("");
    logBody.prepend(tr);
    capAuditRows();
    applyLogFilter(activeLogFilter);
  }

  function prependCustomLog(type, instruction) {
    const id = auditId();
    rows[type] = [currentTime(), type, instruction, id];
    prependLog(type);
    return id;
  }

  function getLogType(row) {
    if (row.dataset.logType) return row.dataset.logType;
    const cells = row.querySelectorAll("td");
    return cells[1]?.textContent.trim().toLowerCase() || "all";
  }

  function matchesLogFilter(row, filter) {
    if (filter === "all") return true;
    const type = getLogType(row);
    return type === filter;
  }

  function applyLogFilter(filter) {
    activeLogFilter = filter;
    logFilters.forEach((button) => {
      const buttonFilter = button.dataset.filter || button.textContent.trim().toLowerCase();
      button.classList.toggle("active", buttonFilter === filter);
    });
    if (!logBody) return;
    logBody.querySelectorAll("tr").forEach((row) => {
      row.hidden = !matchesLogFilter(row, filter);
    });
  }

  function applySimulation(type) {
    if (type === "approved") {
      status.textContent = "Approved";
      if (pendingCount) pendingCount.textContent = "7";
      if (escalationMeter) escalationMeter.style.width = "54%";
      if (decisionTime) decisionTime.textContent = "2m 02s";
      const instruction = "Proceed with the proposed refund.";
      const id = prependCustomLog("approved", instruction);
      setCode("Agent receives", decisionCode("approved", instruction, id));
      showToast("Approval recorded");
    }

    if (type === "rejected") {
      status.textContent = "Rejected";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      const instruction = "Do not issue the refund. Ask for proof of purchase first.";
      const id = prependCustomLog("rejected", instruction);
      setCode("Agent receives", decisionCode("rejected", instruction, id));
      showToast("Rejection sent to agent");
    }

    if (type === "edited") {
      status.textContent = "Editing";
      if (editPanel) editPanel.hidden = false;
      if (editInput) editInput.focus();
      setCode("Edit response", decisionCode("edited", editInput?.value || "Offer store credit instead of a cash refund."));
      showToast("Write the instruction to return");
    }

    if (type === "context_added") {
      status.textContent = "Context added";
      if (decisionTime) decisionTime.textContent = "3m 18s";
      setCode("Agent receives", decisionCode("context_added", "Use the added policy context and continue."));
      prependLog("context_added");
      showToast("Context returned to agent");
    }

    if (type === "taken_over") {
      status.textContent = "Taken over";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      setCode("Agent receives", decisionCode("taken_over", "Human reviewer has taken over. Stop autonomous execution."));
      prependLog("taken_over");
      showToast("Human takeover recorded");
    }

    if (type === "needs_more_info") {
      status.textContent = "Needs more info";
      setCode("Agent receives", decisionCode("needs_more_info", "Fetch the customer's last three support tickets and escalate again."));
      prependLog("needs_more_info");
      showToast("Agent asked to gather more context");
    }

    track("dashboard_simulation_clicked", { type });
  }

  document.querySelectorAll("[data-simulate]").forEach((button) => {
    button.addEventListener("click", () => applySimulation(button.dataset.simulate));
  });

  if (editInput) {
    editInput.addEventListener("input", () => {
      setCode("Edit response", decisionCode("edited", editInput.value || "Offer store credit instead of a cash refund."));
    });
  }

  if (sendEdit) {
    sendEdit.addEventListener("click", () => {
      const instruction = editInput?.value.trim() || "Offer store credit instead of a cash refund.";
      status.textContent = "Edited";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      const id = prependCustomLog("edited", instruction);
      setCode("Agent receives", decisionCode("edited", instruction, id));
      if (editPanel) editPanel.hidden = true;
      showToast("Edited instruction returned");
      track("dashboard_edit_instruction_sent");
    });
  }

  logFilters.forEach((button) => {
    const filter = button.dataset.filter || button.textContent.trim().toLowerCase();
    button.dataset.filter = filter;
    button.addEventListener("click", () => {
      applyLogFilter(filter);
      track("dashboard_log_filter_clicked", { filter });
    });
  });
  applyLogFilter(activeLogFilter);

  if (!pause) return;
  let paused = false;
  pause.addEventListener("click", () => {
    paused = !paused;
    status.textContent = paused ? "Expired" : "Live demo";
    pause.textContent = paused ? "Reset expiration" : "Simulate expired request";
    if (paused) {
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      const instruction = "No reviewer responded before timeout. Stop the risky action.";
      const id = prependCustomLog("expired", instruction);
      setCode("Agent receives", decisionCode("expired", instruction, id));
      showToast("Approval request expired");
    }
    track(paused ? "approval_expired_demo" : "approval_reset_demo");
  });
}

function initFaqTracking() {
  document.querySelectorAll("details").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (detail.open) track("faq_opened", { question: detail.querySelector("summary")?.textContent });
    });
  });
}

document.querySelectorAll("[data-track]").forEach((el) => {
  el.addEventListener("click", () => track(el.dataset.track));
});

track(`${document.body.dataset.page}_viewed`);
initPostHog();
revealOnScroll();
initCopyButtons();
initHeroSwap();
initConsoleMotion();
initImpactCalculator();
initWaitlist();
initDashboard();
initFaqTracking();

function initThanksReferral() {
  const referral = document.getElementById("referral-link");
  const referralCode = document.getElementById("referral-code");
  if (!referral) return;
  const params = new URLSearchParams(location.search);
  const lead = params.get("lead") || "founding";
  const code = params.get("code") || `FS-${lead.slice(-6).toUpperCase()}`;
  if (params.get("duplicate") === "1") {
    const heading = document.querySelector(".thanks-card h1");
    if (heading) heading.textContent = "This email is already registered for early access.";
  }
  if (referralCode) referralCode.textContent = code;
  referral.value = `${location.origin}/?utm_source=referral&utm_medium=waitlist&utm_campaign=founding_500&ref=${encodeURIComponent(code)}`;
  document.getElementById("copy-referral")?.addEventListener("click", async () => {
    const copied = await copyText(referral.value);
    const button = document.getElementById("copy-referral");
    if (button) {
      button.textContent = copied ? "Copied" : "Select link";
      setTimeout(() => (button.textContent = "Copy"), 1400);
    }
    showToast(copied ? "Referral link copied" : "Select and copy the link");
    track("referral_link_copied", { lead });
  });

  const inviteForm = document.getElementById("invite-email-form");
  inviteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = inviteForm.querySelector(".mini-status");
    const data = Object.fromEntries(new FormData(inviteForm).entries());
    const recipients = String(data.inviteEmails || "").trim();
    if (status) status.textContent = "Sending invites...";
    try {
      const response = await fetch("/api/referral-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: lead,
          referralCode: code,
          referralLink: referral.value,
          inviteEmails: recipients
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Invites could not be sent.");
      const label = result.sent === 1 ? "invite" : "invites";
      const skipped = result.skippedRegistered ? ` ${result.skippedRegistered} already registered.` : "";
      if (status) status.textContent = `${result.sent} ${label} sent.${skipped}`;
      inviteForm.reset();
      showToast(`${result.sent} referral ${label} sent`);
      track("referral_email_invites_sent", { lead, sent: result.sent });
    } catch (error) {
      if (status) status.textContent = error.message || "Invites could not be sent.";
      track("referral_email_invites_failed", { lead, message: status?.textContent });
    }
  });

  const qualificationForm = document.getElementById("qualification-form");
  qualificationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qualificationForm.querySelector(".mini-status");
    if (status) status.textContent = "Sending...";
    const data = Object.fromEntries(new FormData(qualificationForm).entries());
    try {
      const response = await fetch("/api/waitlist-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead, ...data })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Context could not be saved.");
      if (status) status.textContent = "Context saved. Thank you.";
      showToast("Context saved");
      track("waitlist_profile_submitted", { lead, provider: data.provider, role: data.role });
    } catch (error) {
      if (status) status.textContent = error.message || "Context could not be saved.";
      track("waitlist_profile_failed", { lead, message: status?.textContent });
    }
  });
}

initThanksReferral();

function initContactForm() {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("contact-status");
  if (!form || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Sending...";
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Message failed.");
      status.textContent = "Message sent. Check your inbox for confirmation.";
      form.reset();
      showToast("Message sent");
      track("contact_message_sent", { role: data.role });
    } catch (error) {
      status.textContent = error.message || "Message could not be sent.";
      track("contact_message_failed", { message: status.textContent });
    }
  });
}

prefillReferralCodes();
initContactForm();
