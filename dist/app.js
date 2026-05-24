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
  const before = 'agent proposes: "Issue $500 refund"';
  const after = 'forsig waits for: approval / rejection / edit';
  let useAfter = false;
  setInterval(() => {
    useAfter = !useAfter;
    code.textContent = useAfter ? after : before;
  }, 2200);
}

function initConsoleMotion() {
  const title = document.getElementById("decision-title");
  const pill = document.getElementById("decision-pill");
  const model = document.getElementById("decision-model");
  const fill = document.getElementById("spend-fill");
  const reason = document.getElementById("decision-reason");
  const reviewer = document.getElementById("metric-tokens");
  const responseTime = document.getElementById("metric-cost");
  const policy = document.getElementById("metric-policy");
  if (!title || !pill || !model || !fill || !reason || !reviewer || !responseTime || !policy) return;

  const states = [
    {
      title: "Refund over limit",
      pill: "pending",
      model: "Refund Agent",
      fill: "68%",
      reason: 'Proposed action: <strong>Issue $500 refund</strong>. Waiting for a human reviewer before the agent continues.',
      reviewer: "Support lead",
      responseTime: "2m 14s",
      policy: "needs approval",
      danger: true
    },
    {
      title: "Edited instruction",
      pill: "edited",
      model: "Sales Agent",
      fill: "52%",
      reason: 'Reviewer changed the instruction to <strong>send a 10% offer</strong> instead of 25%.',
      reviewer: "Sales manager",
      responseTime: "1m 03s",
      policy: "resume",
      danger: false
    },
    {
      title: "Deployment action rejected",
      pill: "rejected",
      model: "Deploy Agent",
      fill: "86%",
      reason: 'Reviewer rejected <strong>production migration</strong> until staging proof is attached.',
      reviewer: "Engineering lead",
      responseTime: "4m 22s",
      policy: "stop",
      danger: true
    }
  ];

  let index = 0;
  setInterval(() => {
    index = (index + 1) % states.length;
    const state = states[index];
    title.textContent = state.title;
    pill.textContent = state.pill;
    model.textContent = state.model;
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
          code: result.referralCode || "",
          position: String(result.position || "")
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
  const dailySpend = document.getElementById("daily-spend");
  const dailyMeter = document.getElementById("daily-meter");
  const blockedCount = document.getElementById("blocked-count");
  const tokenTotal = document.getElementById("token-total");
  const logBody = document.getElementById("demo-log-body");
  const logFilters = document.querySelectorAll(".log-filters button");
  if (!status) return;
  let activeLogFilter = "all";

  const rows = {
    approved: ["12:21", "Refund Agent", "refund_over_limit", "approved", "support_lead", "Issue $500 refund", "Approved as written", "audit_R7x2"],
    rejected: ["12:22", "Deploy Agent", "deployment_action", "rejected", "engineering_lead", "Run production migration", "Needs staging proof", "audit_D4m8"],
    edited: ["12:23", "Sales Agent", "external_message", "edited", "sales_manager", "Send 25% discount", "Send 10% offer instead", "audit_E9q1"],
    expired: ["12:24", "Ops Agent", "billing_action", "expired", "ops_lead", "Retry invoice reminder", "Reviewer timeout", "audit_X5p0"]
  };

  function prependLog(type) {
    if (!logBody) return;
    const tr = document.createElement("tr");
    tr.className = "flash-row";
    tr.dataset.logType = type;
    tr.innerHTML = rows[type].map((cell) => `<td>${cell}</td>`).join("");
    logBody.prepend(tr);
    applyLogFilter(activeLogFilter);
  }

  function getLogType(row) {
    if (row.dataset.logType) return row.dataset.logType;
    const cells = row.querySelectorAll("td");
    return cells[3]?.textContent.trim().toLowerCase() || "all";
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
      if (dailySpend) dailySpend.textContent = "7";
      if (dailyMeter) dailyMeter.style.width = "54%";
      if (tokenTotal) tokenTotal.textContent = "2m 02s";
      prependLog("approved");
      showToast("Approval recorded");
    }

    if (type === "rejected") {
      status.textContent = "Rejected";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      prependLog("rejected");
      showToast("Rejection sent to agent");
    }

    if (type === "edited") {
      status.textContent = "Edited";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "23") + 1);
      prependLog("edited");
      showToast("Edited instruction returned");
    }

    track("dashboard_simulation_clicked", { type });
  }

  document.querySelectorAll("[data-simulate]").forEach((button) => {
    button.addEventListener("click", () => applySimulation(button.dataset.simulate));
  });

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
      prependLog("expired");
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
  const position = document.getElementById("waitlist-position");
  const referralCode = document.getElementById("referral-code");
  if (!referral || !position) return;
  const params = new URLSearchParams(location.search);
  const lead = params.get("lead") || "founding";
  const code = params.get("code") || `FS-${lead.slice(-6).toUpperCase()}`;
  const queryPosition = Number(params.get("position"));
  position.textContent = queryPosition > 0 ? `#${queryPosition.toLocaleString()}` : "#1,000+";
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
      setTimeout(() => (button.textContent = "Invite another builder"), 1400);
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
