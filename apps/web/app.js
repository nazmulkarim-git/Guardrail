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
  const before = 'baseURL: "https://api.openai.com/v1"\napiKey: process.env.OPENAI_API_KEY';
  const after = 'baseURL: "https://gateway.forsig.com/v1"\napiKey: process.env.FORSIG_API_KEY';
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
  const tokens = document.getElementById("metric-tokens");
  const cost = document.getElementById("metric-cost");
  const policy = document.getElementById("metric-policy");
  if (!title || !pill || !model || !fill || !reason || !tokens || !cost || !policy) return;

  const states = [
    {
      title: "Blocked before provider spend",
      pill: "402 budget",
      model: "gpt-4o",
      fill: "91%",
      reason: 'Daily budget would exceed <strong>$25.00</strong>. Forsig skipped the OpenAI call.',
      tokens: "12,840",
      cost: "$3.14",
      policy: "budget cap",
      danger: true
    },
    {
      title: "Allowed under policy",
      pill: "200 allowed",
      model: "gpt-4o-mini",
      fill: "34%",
      reason: 'Request is within the <strong>$0.20</strong> per-call limit. Forwarding to OpenAI.',
      tokens: "1,248",
      cost: "$0.004",
      policy: "allowed",
      danger: false
    },
    {
      title: "Paused by kill switch",
      pill: "423 paused",
      model: "support-agent",
      fill: "68%",
      reason: 'Agent is paused while the team investigates a customer workflow.',
      tokens: "0",
      cost: "$0.00",
      policy: "paused",
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
    tokens.textContent = state.tokens;
    cost.textContent = state.cost;
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
    const requestCount = Number(requests.value);
    const perRequest = Number(cost.value) / 100;
    total.textContent = `$${(requestCount * perRequest).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    requestLabel.textContent = `${requestCount} requests`;
    costLabel.textContent = `$${perRequest.toFixed(2)}/request`;
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
        showToast("You are on the waitlist");
        const params = new URLSearchParams({ lead: result.leadId, code: result.referralCode || "" });
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
  if (!status) return;

  const rows = {
    allowed: ["12:06", "Support Copilot", "cust_789", "allowed", "gpt-4o-mini", "812", "$0.0028", "-", "1.1s"],
    budget: ["12:07", "Support Copilot", "cust_789", "blocked", "gpt-4o", "2,180 est.", "$0.044 est.", "daily_budget_exceeded", "38ms"],
    model: ["12:08", "Sales Email Agent", "usr_812", "blocked", "gpt-4.1", "980 est.", "$0.019 est.", "model_not_allowed", "35ms"],
    paused: ["12:09", "Support Copilot", "cust_789", "blocked", "gpt-4o-mini", "0", "$0.00", "agent_paused", "24ms"]
  };

  function prependLog(type) {
    if (!logBody) return;
    const tr = document.createElement("tr");
    tr.className = "flash-row";
    tr.innerHTML = rows[type].map((cell) => `<td>${cell}</td>`).join("");
    logBody.prepend(tr);
  }

  function applySimulation(type) {
    if (type === "allowed") {
      status.textContent = "Active";
      if (dailySpend) dailySpend.textContent = "$0.77 / $1.00";
      if (dailyMeter) dailyMeter.style.width = "77%";
      if (tokenTotal) tokenTotal.textContent = "49,031";
      prependLog("allowed");
      showToast("Allowed under policy");
    }

    if (type === "budget") {
      status.textContent = "Active";
      if (dailySpend) dailySpend.textContent = "$0.99 / $1.00";
      if (dailyMeter) dailyMeter.style.width = "99%";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "7") + 1);
      prependLog("budget");
      showToast("Blocked before provider spend");
    }

    if (type === "model") {
      status.textContent = "Active";
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "7") + 1);
      prependLog("model");
      showToast("Model blocked by policy");
    }

    track("dashboard_simulation_clicked", { type });
  }

  document.querySelectorAll("[data-simulate]").forEach((button) => {
    button.addEventListener("click", () => applySimulation(button.dataset.simulate));
  });

  if (!pause) return;
  let paused = false;
  pause.addEventListener("click", () => {
    paused = !paused;
    status.textContent = paused ? "Paused" : "Active";
    pause.textContent = paused ? "Resume simulation" : "Simulate pause";
    if (paused) {
      if (blockedCount) blockedCount.textContent = String(Number(blockedCount.textContent || "7") + 1);
      prependLog("paused");
      showToast("Agent paused");
    }
    track(paused ? "agent_paused_demo" : "agent_resumed_demo");
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
  const numeric = [...lead].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  position.textContent = `#${1000 + (numeric % 497)}`;
  if (referralCode) referralCode.textContent = code;
  referral.value = `${location.origin}/?utm_source=referral&utm_medium=waitlist&utm_campaign=founding_500&ref=${encodeURIComponent(code)}`;
  document.getElementById("copy-referral")?.addEventListener("click", async () => {
    const copied = await copyText(referral.value);
    const button = document.getElementById("copy-referral");
    if (button) {
      button.textContent = copied ? "Copied" : "Select link";
      setTimeout(() => (button.textContent = "Copy referral link"), 1400);
    }
    showToast(copied ? "Referral link copied" : "Select and copy the link");
    track("referral_link_copied", { lead });
  });

  document.getElementById("copy-share-text")?.addEventListener("click", async () => {
    const text = document.getElementById("share-text")?.value || "";
    const copied = await copyText(text);
    showToast(copied ? "Share text copied" : "Select and copy the text");
    track("share_text_copied", { lead });
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
