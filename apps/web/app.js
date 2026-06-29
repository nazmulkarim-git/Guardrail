const analyticsConfig = {
  posthogKey: "",
  posthogHost: "https://app.posthog.com",
  hotjarId: "",
  hotjarVersion: 6,
  hotjarLoaded: false,
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
    const wrapper = input.closest(".zip-referral-field");
    if (wrapper) wrapper.hidden = false;
    const toggle = wrapper?.parentElement?.querySelector("[data-toggle-referral]");
    if (toggle) toggle.hidden = true;
  });
}

function initReferralToggle() {
  document.querySelectorAll("[data-toggle-referral]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const wrapper = form?.querySelector(".zip-referral-field");
      const input = wrapper?.querySelector('input[name="referralCode"]');
      if (wrapper) wrapper.hidden = false;
      button.hidden = true;
      input?.focus();
      track("referral_code_field_opened", { sourceSection: form?.id || "unknown" });
    });
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
    analyticsConfig.hotjarId = config.hotjarId || "";
    analyticsConfig.hotjarVersion = Number(config.hotjarVersion || 6);
  } catch {
    analyticsConfig.posthogKey = "";
    analyticsConfig.hotjarId = "";
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

async function initHotjar() {
  if (!analyticsConfig.posthogKey && !analyticsConfig.hotjarId) await loadRuntimeConfig();
  if (!analyticsConfig.hotjarId || analyticsConfig.hotjarLoaded) return;
  const hotjarId = Number(analyticsConfig.hotjarId);
  if (!Number.isFinite(hotjarId)) return;
  analyticsConfig.hotjarLoaded = true;
  const hotjarVersion = analyticsConfig.hotjarVersion || 6;
  window.hj =
    window.hj ||
    function () {
      (window.hj.q = window.hj.q || []).push(arguments);
    };
  window._hjSettings = { hjid: hotjarId, hjsv: hotjarVersion };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://static.hotjar.com/c/hotjar-${hotjarId}.js?sv=${hotjarVersion}`;
  document.head.appendChild(script);
  track("hotjar_loaded");
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

function initHeroEmailShortcut() {
  const heroEmail = document.querySelector("[data-hero-email]");
  const waitlistEmail = document.querySelector('#waitlist-form input[name="email"]');
  const heroCta = document.querySelector("[data-hero-email-submit]");
  if (!heroEmail || !waitlistEmail || !heroCta) return;
  const sync = () => {
    if (heroEmail.value.trim()) waitlistEmail.value = heroEmail.value.trim();
  };
  heroEmail.addEventListener("input", sync);
  heroEmail.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sync();
      document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth", block: "start" });
      waitlistEmail.focus();
      track("hero_inline_email_entered");
    }
  });
  heroCta.addEventListener("click", sync);
}

function initHeroSwap() {
  const code = document.getElementById("hero-code");
  if (!code) return;
  const before = 'forsig.escalate({ risk: "refund_over_limit" })';
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
      const emailInput = entry.form.querySelector('input[name="email"]');
      const email = emailInput?.value?.trim() || "";
      if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        entry.status.textContent = "Enter a valid work email.";
        emailInput.setAttribute("aria-invalid", "true");
        emailInput.focus();
        track("waitlist_signup_failed", { message: "invalid_email", sourceSection: entry.sourceSection });
        return;
      }
      emailInput?.removeAttribute("aria-invalid");
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
        entry.status.textContent = "You are on the beta list.";
        const referralBox = entry.form.querySelector(".lp-referral-result");
        const referralInput = entry.form.querySelector("[data-referral-link]");
        const referralCode = result.referralCode || result.leadId || btoa(data.email || "forsig").replace(/=+$/g, "").slice(0, 10);
        const referralUrl = `${location.origin}/?ref=${encodeURIComponent(referralCode)}`;
        if (referralBox && referralInput) {
          referralInput.value = referralUrl;
          referralBox.hidden = false;
          track("waitlist_referral_link_shown", { sourceSection: entry.sourceSection });
          return;
        }
        const followup = document.getElementById("waitlist-followup-form");
        const leadInput = followup?.querySelector('input[name="leadId"]');
        if (followup && leadInput) {
          leadInput.value = result.leadId;
          followup.hidden = false;
          followup.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          const params = new URLSearchParams({ lead: result.leadId, code: result.referralCode || "" });
          location.replace(`/thanks?${params.toString()}`);
        }
      } catch (error) {
        entry.status.textContent = error.message || "Something went wrong.";
        track("waitlist_signup_failed", { message: entry.status.textContent, sourceSection: entry.sourceSection });
      }
    });
  }
}

function initLandingV2Interactions() {
  const modal = document.querySelector(".lp-demo-modal, .conversion-modal");
  const nav = document.querySelector(".conversion-nav");
  const openButtons = document.querySelectorAll("[data-open-demo]");
  const closeDemo = modal?.querySelector("[data-close-demo]");
  const modalVideo = modal?.querySelector("video");
  openButtons.forEach((openDemo) => {
    openDemo.addEventListener("click", () => {
      if (!modal) return;
      modal.hidden = false;
      closeDemo?.focus();
      track("landing_demo_modal_opened");
    });
  });
  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    modalVideo?.pause?.();
    openButtons[0]?.focus();
    track("landing_demo_modal_closed");
  };
  closeDemo?.addEventListener("click", () => {
    closeModal();
  });
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeModal();
    }
  });

  document.querySelectorAll("[data-copy-referral]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = button.closest("form")?.querySelector("[data-referral-link]");
      await copyText(input?.value || "");
      button.textContent = "Copied";
      showToast("Referral link copied");
      track("waitlist_referral_link_copied");
      setTimeout(() => (button.textContent = "Copy referral link"), 1400);
    });
  });

  const totalSeats = 50;
  const seatsLeft = Math.max(0, Number(localStorage.getItem("forsig_beta_seats_left") || 33));
  document.querySelectorAll("[data-seats-left]").forEach((el) => {
    el.textContent = String(seatsLeft);
  });
  document.querySelectorAll("[data-seat-progress]").forEach((el) => {
    el.style.width = `${Math.min(100, Math.max(0, ((totalSeats - seatsLeft) / totalSeats) * 100))}%`;
  });
  if (nav) {
    const updateNav = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    updateNav();
    window.addEventListener("scroll", updateNav, { passive: true });
  }
}

function initWaitlistFollowup() {
  const form = document.getElementById("waitlist-followup-form");
  if (!form) return;
  const frameworkSelect = form.elements.frameworkInterest;
  const frameworkOther = form.elements.frameworkOther;
  function selectedFrameworks() {
    const selected = Array.from(frameworkSelect?.selectedOptions || []).map((option) => option.value).filter(Boolean);
    const other = frameworkOther?.value?.trim();
    return selected.map((name) => (name === "Other" && other ? `Other: ${other}` : name)).join(", ");
  }
  frameworkSelect?.addEventListener("change", () => {
    const wantsOther = Array.from(frameworkSelect.selectedOptions).some((option) => option.value === "Other");
    if (frameworkOther) {
      frameworkOther.hidden = !wantsOther;
      frameworkOther.required = wantsOther;
      if (!wantsOther) frameworkOther.value = "";
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = form.querySelector(".mini-status");
    const data = Object.fromEntries(new FormData(form).entries());
    data.frameworkInterest = selectedFrameworks();
    delete data.frameworkOther;
    if (status) status.textContent = "Sending...";
    try {
      const response = await fetch("/api/waitlist-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Context could not be saved.");
      if (status) status.textContent = "Context saved. Thank you.";
      showToast("Context saved");
      track("waitlist_followup_submitted", {
        frameworkInterest: data.frameworkInterest
      });
    } catch (error) {
      if (status) status.textContent = error.message || "Context could not be saved.";
      track("waitlist_followup_failed", { message: status?.textContent });
    }
  });
}

function initPricingIntent() {
  document.querySelectorAll("[data-plan-interest]").forEach((button) => {
    button.addEventListener("click", () => {
      const plan = button.dataset.planInterest || "free";
      const input = document.querySelector('#waitlist-form input[name="planInterest"]');
      if (input) input.value = plan;
      track("pricing_cta_clicked", { planInterest: plan });
    });
  });
}

function initHeroApprovalCard() {
  const status = document.getElementById("hero-approval-status");
  const preview = document.getElementById("hero-returned-json");
  if (!status || !preview) return;
  const responses = {
    approved: {
      label: "Approved",
      payload: { status: "approved", instruction: "Proceed after backup and rollback verification." }
    },
    rejected: {
      label: "Rejected",
      payload: { status: "rejected", instruction: "Do not run the billing migration without rollback proof." }
    },
    edited: {
      label: "Edited",
      payload: { status: "edited", instruction: "Run a read-only dry run and attach the migration plan." }
    },
    taken_over: {
      label: "Taken over",
      payload: { status: "taken_over", instruction: "Human reviewer took over. Stop autonomous execution." }
    }
  };
  document.querySelectorAll("[data-hero-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const response = responses[button.dataset.heroDecision] || responses.approved;
      status.textContent = response.label;
      preview.textContent = JSON.stringify(response.payload, null, 2);
      track("hero_demo_decision_clicked", { decision: response.payload.status });
    });
  });
}

function initSdkTabs() {
  const code = document.getElementById("sdk-code");
  const title = document.getElementById("sdk-code-title");
  if (!code || !title) return;
  let activeLanguage = "ts";
  let activeScenario = "refunds";
  const snippets = {
    ts: {
      refunds: {
        title: "src/agents/refund.ts",
        terminal: "forsig: intercepted refund_over_limit",
        code: `import { Forsig } from "@forsig/sdk";
import Stripe from "stripe";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const decision = await forsig.escalations.create({
  agent: "refund-agent",
  action: "stripe.refund",
  risk: "refund_over_limit",
  context: {
    customer: "VIP customer #123",
    amount: 500,
    reason: "Refund exceeds policy limit"
  },
});

if (decision.status === "approved") {
  await stripe.refunds.create({
    amount: 50000,
    customer: "cus_123"
  });
}

if (decision.status === "rejected") {
  return "Refund rejected by reviewer";
}

if (decision.status === "edited") {
  return decision.instruction;
}`
      },
      deployments: {
        title: "src/agents/deploy.ts",
        terminal: "forsig: intercepted production_deploy",
        code: `import { Forsig } from "@forsig/sdk";
import { deployRelease } from "../deployments";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.escalations.create({
  agent: "deploy-agent",
  action: "production.deploy",
  risk: "production_deploy",
  context: {
    service: "billing-api",
    environment: "production",
    commit: "8f41c2a",
    rollback: "rollback plan attached"
  },
});

if (decision.status !== "approved") {
  return decision.instruction || "Deployment stopped";
}

await deployRelease({
  service: "billing-api",
  environment: "production",
  commit: "8f41c2a"
});`
      },
      emails: {
        title: "src/agents/outreach.ts",
        terminal: "forsig: intercepted external_email",
        code: `import { Forsig } from "@forsig/sdk";
import { sendEmail } from "../mail";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.escalations.create({
  agent: "sales-agent",
  action: "email.send",
  risk: "external_email",
  context: {
    recipient: "procurement@example.com",
    subject: "Custom enterprise offer",
    discount: "30%",
    reason: "Discount is outside policy"
  },
});

if (decision.status === "approved") {
  await sendEmail("procurement@example.com", approvedOfferCopy);
}

if (decision.status === "edited") {
  await sendEmail("procurement@example.com", decision.instruction);
}`
      },
      spend: {
        title: "src/agents/research.ts",
        terminal: "forsig: intercepted paid_tool_call",
        code: `import { Forsig } from "@forsig/sdk";
import { buyExport } from "../tools/market-data";

const forsig = new Forsig({
  apiKey: process.env.FORSIG_API_KEY
});

const decision = await forsig.escalations.create({
  agent: "research-agent",
  action: "market_data_export.purchase",
  risk: "paid_tool_call",
  context: {
    tool: "market_data_export",
    requestedSpend: 300,
    budgetRemaining: 420,
    reason: "Large one-time external purchase"
  },
});

if (decision.status === "approved") {
  await buyExport({ limit: 1000, maxSpend: 300 });
}`
      }
    },
    py: {
      refunds: {
        title: "agents/refund.py",
        terminal: "forsig: intercepted refund_over_limit",
        code: `import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalations.create(
    agent="refund-agent",
    action="stripe.refund",
    risk="refund_over_limit",
    context={
        "customer": "VIP customer #123",
        "amount": 500,
        "reason": "Refund exceeds policy limit",
    },
)

if decision.status == "approved":
    issue_refund()`
      },
      deployments: {
        title: "agents/deploy.py",
        terminal: "forsig: intercepted production_deploy",
        code: `import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalations.create(
    agent="deploy-agent",
    action="production.deploy",
    risk="production_deploy",
    context={
        "service": "billing-api",
        "environment": "production",
        "commit": "8f41c2a",
        "rollback": "rollback plan attached",
    },
)

if decision.status == "approved":
    deploy_release(service="billing-api", environment="production")
else:
    stop_deployment(decision.instruction)`
      },
      emails: {
        title: "agents/outreach.py",
        terminal: "forsig: intercepted external_email",
        code: `import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalations.create(
    agent="sales-agent",
    action="email.send",
    risk="external_email",
    context={
        "recipient": "procurement@example.com",
        "subject": "Custom enterprise offer",
        "discount": "30%",
        "reason": "Discount is outside policy",
    },
)

if decision.status == "approved":
    send_email("procurement@example.com", approved_offer_copy)
elif decision.status == "edited":
    send_email("procurement@example.com", decision.instruction)`
      },
      spend: {
        title: "agents/research.py",
        terminal: "forsig: intercepted paid_tool_call",
        code: `import os
from forsig import Forsig

forsig = Forsig(api_key=os.environ["FORSIG_API_KEY"])

decision = forsig.escalations.create(
    agent="research-agent",
    action="market_data_export.purchase",
    risk="paid_tool_call",
    context={
        "tool": "market_data_export",
        "requestedSpend": 300,
        "budgetRemaining": 420,
        "reason": "Large one-time external purchase",
    },
)

if decision.status == "approved":
    buy_export(limit=1000, max_spend=300)`
      }
    }
  };
  function show(language = activeLanguage, scenario = activeScenario) {
    activeLanguage = language;
    activeScenario = scenario;
    const snippet = snippets[activeLanguage][activeScenario] || snippets.ts.refunds;
    title.textContent = snippet.title;
    code.textContent = snippet.code;
    document.querySelector(".mac-titlebar b").textContent = `~/agent-workflows/${snippet.title}`;
    const terminal = document.querySelector(".mac-terminal span:first-child");
    if (terminal) terminal.textContent = snippet.terminal;
    document.querySelectorAll("[data-sdk-tab]").forEach((button) => button.classList.toggle("active", button.dataset.sdkTab === activeLanguage));
    document.querySelectorAll("[data-sdk-scenario]").forEach((button) => button.classList.toggle("active", button.dataset.sdkScenario === activeScenario));
    track("sdk_snippet_changed", { language: activeLanguage, scenario: activeScenario });
  }
  document.querySelectorAll("[data-sdk-tab]").forEach((button) => {
    button.addEventListener("click", () => show(button.dataset.sdkTab, activeScenario));
  });
  document.querySelectorAll("[data-sdk-scenario]").forEach((button) => {
    button.addEventListener("click", () => show(activeLanguage, button.dataset.sdkScenario));
  });
  show();
}

function initMinimalCodeTabs() {
  const code = document.getElementById("minimal-code");
  const title = document.getElementById("minimal-code-title");
  if (!code || !title) return;

  const actionSelect = document.getElementById("sandbox-action");
  const sandboxTitle = document.getElementById("sandbox-title");
  const sandboxCopy = document.getElementById("sandbox-copy");
  const sandboxRisk = document.getElementById("sandbox-risk");
  const sandboxStatus = document.getElementById("sandbox-status");
  const sandboxContext = document.getElementById("sandbox-context");
  const sandboxJson = document.getElementById("sandbox-json");
  const timelineSteps = Array.from(document.querySelectorAll(".sandbox-timeline span"));

  const snippets = {
    ts: {
      refund: {
      title: "agent.ts",
        code: `const decision = await forsig.escalations.create({
  action: "stripe.refund",
  risk: "refund_over_limit",
  context: { amount: 500, customer: "VIP" }
});`
      },
      migration: {
        title: "deploy-agent.ts",
        code: `const decision = await forsig.escalations.create({
  action: "database.migration",
  risk: "production_schema_change",
  context: { table: "billing_accounts", environment: "production" }
});`
      },
      email: {
        title: "email-agent.ts",
        code: `const decision = await forsig.escalations.create({
  action: "email.send",
  risk: "external_customer_message",
  context: { recipient: "procurement@example.com", discount: "30%" }
});`
      },
      spend: {
        title: "research-agent.ts",
        code: `const decision = await forsig.escalations.create({
  action: "tool.purchase",
  risk: "paid_tool_spend",
  context: { tool: "market_data_export", amount: 300, budgetRemaining: 420 }
});`
      }
    },
    py: {
      refund: {
      title: "agent.py",
      code: `decision = forsig.escalations.create(
    action="stripe.refund",
    risk="refund_over_limit",
    context={"amount": 500, "customer": "VIP"},
)`
      },
      migration: {
        title: "deploy_agent.py",
        code: `decision = forsig.escalations.create(
    action="database.migration",
    risk="production_schema_change",
    context={"table": "billing_accounts", "environment": "production"},
)`
      },
      email: {
        title: "email_agent.py",
        code: `decision = forsig.escalations.create(
    action="email.send",
    risk="external_customer_message",
    context={"recipient": "procurement@example.com", "discount": "30%"},
)`
      },
      spend: {
        title: "research_agent.py",
        code: `decision = forsig.escalations.create(
    action="tool.purchase",
    risk="paid_tool_spend",
    context={"tool": "market_data_export", "amount": 300, "budget_remaining": 420},
)`
      }
    }
  };

  const scenarios = {
    refund: {
      title: "Approve refund for customer #123",
      copy: "The support agent wants to issue a $500 refund to a VIP customer.",
      risk: "High risk",
      context: [["Amount", "$500"], ["Reason", "Above policy limit"], ["Reviewer", "Support lead"]],
      pending: {
        action: "stripe.refund",
        status: "pending_review",
        risk: "refund_over_limit",
        reviewer: "support-lead@company.com"
      }
    },
    migration: {
      title: "Approve production migration",
      copy: "The deployment agent wants to run a billing-table migration in production.",
      risk: "Critical risk",
      context: [["Environment", "Production"], ["Table", "billing_accounts"], ["Reviewer", "Engineering lead"]],
      pending: {
        action: "database.migration",
        status: "pending_review",
        risk: "production_schema_change",
        reviewer: "eng-lead@company.com"
      }
    },
    email: {
      title: "Review outbound customer email",
      copy: "The sales agent wants to send a custom discount offer to an enterprise prospect.",
      risk: "Medium risk",
      context: [["Recipient", "procurement@example.com"], ["Discount", "30%"], ["Reviewer", "Sales lead"]],
      pending: {
        action: "email.send",
        status: "pending_review",
        risk: "external_customer_message",
        reviewer: "sales-lead@company.com"
      }
    },
    spend: {
      title: "Approve paid tool export",
      copy: "The research agent wants to buy a $300 market data export.",
      risk: "High risk",
      context: [["Tool", "market_data_export"], ["Spend", "$300"], ["Budget", "$420 left"]],
      pending: {
        action: "tool.purchase",
        status: "pending_review",
        risk: "paid_tool_spend",
        reviewer: "ops-lead@company.com"
      }
    }
  };

  let activeLanguage = "ts";
  let activeScenario = actionSelect?.value || "refund";

  function setJson(payload) {
    if (sandboxJson) sandboxJson.textContent = JSON.stringify(payload, null, 2);
  }

  function renderScenario() {
    const scenario = scenarios[activeScenario] || scenarios.refund;
    if (sandboxTitle) sandboxTitle.textContent = scenario.title;
    if (sandboxCopy) sandboxCopy.textContent = scenario.copy;
    if (sandboxRisk) sandboxRisk.textContent = scenario.risk;
    if (sandboxStatus) sandboxStatus.textContent = "Pending";
    if (sandboxContext) {
      sandboxContext.innerHTML = scenario.context.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    }
    timelineSteps.forEach((step, index) => step.classList.toggle("active", index < 2));
    setJson(scenario.pending);
  }

  function show(language = activeLanguage) {
    activeLanguage = language;
    const snippet = snippets[activeLanguage]?.[activeScenario] || snippets.ts.refund;
    title.textContent = snippet.title;
    code.style.opacity = "0";
    setTimeout(() => {
      code.textContent = snippet.code;
      code.style.opacity = "1";
    }, 120);
    document.querySelectorAll("[data-minimal-code]").forEach((button) => {
      button.classList.toggle("active", button.dataset.minimalCode === language);
    });
    track("minimal_code_tab_changed", { language, scenario: activeScenario });
  }

  function showDecision(decision) {
    const scenario = scenarios[activeScenario] || scenarios.refund;
    const copy = {
      approved: "Proceed with the proposed action.",
      edited: "Proceed with reviewer edits applied.",
      rejected: "Stop the proposed action."
    };
    if (sandboxStatus) sandboxStatus.textContent = decision;
    timelineSteps.forEach((step) => step.classList.add("active"));
    setJson({
      status: decision,
      instruction: copy[decision],
      signed: true,
      action: scenario.pending.action,
      reviewer: scenario.pending.reviewer
    });
    track("landing_sandbox_decision_clicked", { decision, scenario: activeScenario });
  }

  document.querySelectorAll("[data-minimal-code]").forEach((button) => {
    button.addEventListener("click", () => show(button.dataset.minimalCode));
  });
  if (actionSelect) {
    actionSelect.addEventListener("change", () => {
      activeScenario = actionSelect.value;
      renderScenario();
      show(activeLanguage);
      track("landing_sandbox_action_changed", { scenario: activeScenario });
    });
  }
  document.querySelectorAll("[data-sandbox-decision]").forEach((button) => {
    button.addEventListener("click", () => showDecision(button.dataset.sandboxDecision));
  });
  renderScenario();
  show(activeLanguage);
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
  let dashboardResetTimer;

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

  function resetDashboardDemo() {
    status.textContent = "Live demo";
    if (pendingCount) pendingCount.textContent = "1";
    if (decisionTime) decisionTime.textContent = "2m 14s";
    if (editPanel) editPanel.hidden = true;
    setCode("Agent call", `const decision = await forsig.escalate({
  agent: "refund-agent",
  risk: "refund_over_limit",
  proposedAction: "Issue $500 refund",
  waitForDecision: true
});`);
  }

  function scheduleDashboardReset() {
    clearTimeout(dashboardResetTimer);
    dashboardResetTimer = setTimeout(resetDashboardDemo, 2600);
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
    if (type !== "edited") scheduleDashboardReset();
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
      scheduleDashboardReset();
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
      scheduleDashboardReset();
    }
    track(paused ? "approval_expired_demo" : "approval_reset_demo");
  });
}

function initZipDemo() {
  const demo = document.querySelector("[data-zip-demo]");
  if (!demo) return;

  const title = document.getElementById("zip-demo-title");
  const summary = document.getElementById("zip-demo-summary");
  const agent = document.getElementById("zip-demo-agent");
  const workflow = document.getElementById("zip-demo-workflow");
  const riskLevel = document.getElementById("zip-demo-risk-level");
  const riskReason = document.getElementById("zip-demo-risk-reason");
  const actionJson = document.getElementById("zip-demo-action-json");
  const context = document.getElementById("zip-demo-context");
  const status = document.getElementById("zip-demo-status");
  const expiry = document.getElementById("zip-demo-expiry");
  const actions = document.getElementById("zip-demo-actions");
  const result = document.getElementById("zip-demo-result");
  const editor = document.getElementById("zip-demo-editor");
  const editorLabel = document.getElementById("zip-demo-editor-label");
  const editorInput = document.getElementById("zip-demo-editor-input");
  const editorSubmit = document.getElementById("zip-demo-editor-submit");
  let resetTimer;
  let scenarioIndex = 0;
  let pendingDecision = null;

  const scenarios = [
    {
      key: "refund",
      title: "Review refund for customer #123",
      summary: "The agent wants to issue a $500 refund to a VIP customer.",
      agent: "Refund Agent v1.2.0",
      workflow: "refund-review-flow / step: approval",
      riskLevel: "High",
      riskReason: "Refund exceeds $250 policy limit",
      action: {
        type: "refund",
        amount: 500,
        currency: "USD",
        refund_method: "original_payment_method",
        customer_id: "cus_123"
      },
      context: [
        ["Customer Tier", "VIP"],
        ["Order Value", "$1,200"],
        ["Refund Reason", "Product failed twice"]
      ],
      editDefault: "Approve the refund, but issue store credit instead of cash.",
      instructDefault: "Ask the customer for photos of the failed product before continuing."
    },
    {
      key: "sales",
      title: "Review outbound discount email",
      summary: "The sales agent wants to send a custom 30% offer to an enterprise prospect.",
      agent: "Sales Agent v0.9.4",
      workflow: "enterprise-outreach / step: custom-offer",
      riskLevel: "Medium",
      riskReason: "External customer message with non-standard discount",
      action: {
        type: "external_email",
        recipient: "procurement@example.com",
        proposed_discount: "30%",
        deal_value: 18000
      },
      context: [
        ["Prospect", "Enterprise"],
        ["Deal Value", "$18,000"],
        ["Concern", "Discount exceeds normal band"]
      ],
      editDefault: "Send a 15% discount and ask for a call before offering more.",
      instructDefault: "Check whether this prospect already has an approved pricing exception."
    },
    {
      key: "migration",
      title: "Review production migration",
      summary: "The deployment agent wants to run a migration that touches the billing table.",
      agent: "Deploy Agent v2.1.0",
      workflow: "release-flow / step: migration",
      riskLevel: "Critical",
      riskReason: "Production database change affecting billing data",
      action: {
        type: "database_migration",
        environment: "production",
        table: "billing_accounts",
        rollback_plan: "attached"
      },
      context: [
        ["Environment", "Production"],
        ["Table", "billing_accounts"],
        ["Reviewer", "Engineering lead required"]
      ],
      editDefault: "Run the migration in staging first and attach the validation result.",
      instructDefault: "Fetch the latest migration diff and rollback plan for review."
    },
    {
      title: "Review account status change",
      summary: "The operations agent wants to change a customer's subscription status.",
      agent: "Ops Agent v1.4.1",
      workflow: "account-update / step: subscription-change",
      riskLevel: "High",
      riskReason: "Customer record change with unclear payment status",
      action: {
        type: "subscription_update",
        customer_id: "cus_884",
        from: "monthly",
        to: "annual",
        payment_status: "unclear"
      },
      context: [
        ["Customer", "cus_884"],
        ["Requested Change", "Monthly to annual"],
        ["Issue", "Payment status unclear"]
      ],
      editDefault: "Do not update the subscription until payment status is confirmed.",
      instructDefault: "Check the last invoice and payment method before escalating again."
    },
    {
      key: "spend",
      title: "Review external tool spend",
      summary: "The research agent wants to buy a paid data export through an external tool.",
      agent: "Research Agent v0.8.2",
      workflow: "market-research / step: paid-export",
      riskLevel: "High",
      riskReason: "External tool call spends money",
      action: {
        type: "tool_purchase",
        tool: "market_data_export",
        amount: 300,
        currency: "USD"
      },
      context: [
        ["Budget Remaining", "$420"],
        ["Requested Spend", "$300"],
        ["Issue", "Large one-time external purchase"]
      ],
      editDefault: "Approve only if the export is limited to the top 100 accounts.",
      instructDefault: "Get a lower-cost sample export first."
    }
  ];

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentScenario() {
    return scenarios[scenarioIndex % scenarios.length];
  }

  function renderScenario() {
    const scenario = currentScenario();
    if (title) title.textContent = scenario.title;
    if (summary) summary.textContent = scenario.summary;
    if (agent) agent.textContent = scenario.agent;
    if (workflow) workflow.textContent = scenario.workflow;
    if (riskLevel) riskLevel.textContent = scenario.riskLevel;
    if (riskReason) riskReason.textContent = scenario.riskReason;
    if (actionJson) actionJson.textContent = JSON.stringify(scenario.action, null, 2);
    if (context) {
      context.innerHTML = scenario.context
        .map(([label, value]) => `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</p>`)
        .join("");
    }
    if (status) status.textContent = "Pending";
    if (expiry) expiry.textContent = "Expires in 28 minutes";
    if (actions) actions.hidden = false;
    if (editor) editor.hidden = true;
    if (result) {
      result.hidden = true;
      result.textContent = "";
    }
  }

  function selectScenario(key) {
    const nextIndex = scenarios.findIndex((scenario) => scenario.key === key);
    if (nextIndex >= 0) scenarioIndex = nextIndex;
    document.querySelectorAll("[data-scenario-tab]").forEach((button) => button.classList.toggle("active", button.dataset.scenarioTab === key));
    clearTimeout(resetTimer);
    renderScenario();
    track("demo_scenario_tab_clicked", { scenario: key });
  }

  function showDecision(type, titleText, description, instruction = "") {
    if (status) status.textContent = "Resolved";
    if (expiry) expiry.textContent = "Decision returned to agent";
    if (actions) actions.hidden = true;
    if (editor) editor.hidden = true;
    const terminalLines = {
      approved: ["> decision.status: approved", "> Agent resuming execution...", "> Success"],
      rejected: ["> decision.status: rejected", "> Risky action stopped", "> Workflow closed safely"],
      taken_over: ["> decision.status: taken_over", "> Agent paused", "> Human now owns the task"],
      edited: ["> decision.status: edited", "> Applying reviewer instruction...", "> Agent continues with edited plan"],
      instruct_agent: ["> decision.status: context_added", "> Reviewer instruction attached", "> Agent resumes with new context"]
    }[type] || ["> Decision recorded", "> Agent updated"];
    if (result) {
      result.hidden = false;
      result.innerHTML = `
        <div class="zip-demo-result-icon" aria-hidden="true">✓</div>
        <div>
          <strong>${escapeHtml(titleText)}</strong>
          <p>${escapeHtml(description)}</p>
          ${instruction ? `<code>${escapeHtml(instruction)}</code>` : ""}
        </div>
        <pre class="zip-demo-terminal">${terminalLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</pre>
      `;
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      scenarioIndex += 1;
      renderScenario();
    }, 2300);
  }

  function openEditor(type) {
    const scenario = currentScenario();
    pendingDecision = type;
    if (actions) actions.hidden = true;
    if (editor) editor.hidden = false;
    if (editorLabel) {
      editorLabel.textContent = type === "edited_approved" ? "Edit the instruction returned to the agent" : "Give the agent a new instruction";
    }
    if (editorInput) {
      editorInput.value = type === "edited_approved" ? scenario.editDefault : scenario.instructDefault;
      editorInput.focus();
      editorInput.select();
    }
  }

  demo.querySelectorAll("[data-zip-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.zipDecision;
      clearTimeout(resetTimer);
      if (type === "edited") {
        openEditor(type);
      } else if (type === "approved") {
        showDecision(type, "Approved", "The proposed action was approved and returned to the agent.");
      } else if (type === "rejected") {
        showDecision(type, "Rejected", "The agent receives a rejection and stops the risky action.");
      } else if (type === "taken_over") {
        showDecision(type, "Human Takeover", "The agent is told to stop because a human now owns the task.");
      }
      track("landing_demo_decision_clicked", { type });
    });
  });

  editorSubmit?.addEventListener("click", () => {
    const instruction = editorInput?.value.trim() || "Continue with the reviewer instruction.";
    if (pendingDecision === "edited") {
      showDecision("edited", "Edited & Approved", "The edited instruction was sent back to the agent.", instruction);
    } else {
      showDecision("instruct_agent", "Instruction Sent", "The agent receives new human guidance before continuing.", instruction);
    }
    track("landing_demo_instruction_sent", { type: pendingDecision });
  });

  renderScenario();
  document.querySelectorAll("[data-scenario-tab]").forEach((button) => {
    button.addEventListener("click", () => selectScenario(button.dataset.scenarioTab));
  });
  selectScenario("refund");
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
initHotjar();
revealOnScroll();
initCopyButtons();
initHeroEmailShortcut();
initHeroSwap();
initConsoleMotion();
initImpactCalculator();
initWaitlist();
initLandingV2Interactions();
initWaitlistFollowup();
initPricingIntent();
initHeroApprovalCard();
initSdkTabs();
initMinimalCodeTabs();
initDashboard();
initZipDemo();
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
    data.name = String(data.name || "").trim();
    data.email = String(data.email || "").trim();
    data.message = String(data.message || "").trim();
    if (!data.name || !data.email || !data.message) {
      status.textContent = "Name, email, and message are required.";
      return;
    }
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
initReferralToggle();
initContactForm();

document.querySelectorAll("[data-replace-home]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    location.replace("/");
  });
});
