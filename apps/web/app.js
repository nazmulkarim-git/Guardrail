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

function utmProperties() {
  const params = new URLSearchParams(location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    referrer: document.referrer || null
  };
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
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
      track("code_snippet_copied", { copyType: "install_command" });
      setTimeout(() => (button.textContent = button.dataset.copy), 1200);
    });
  });

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      await navigator.clipboard.writeText(target?.textContent || "");
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

function initWaitlist() {
  const forms = [
    { form: document.getElementById("hero-waitlist-form"), status: document.querySelector("#hero-waitlist-form .mini-status"), sourceSection: "hero_waitlist" },
    { form: document.getElementById("waitlist-form"), status: document.getElementById("form-status"), sourceSection: "landing_waitlist" }
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
        const params = new URLSearchParams({ lead: result.leadId, name: data.name || "" });
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
  if (!pause || !status) return;
  let paused = false;
  pause.addEventListener("click", () => {
    paused = !paused;
    status.textContent = paused ? "Paused" : "Active";
    pause.textContent = paused ? "Resume agent" : "Pause agent";
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
initWaitlist();
initDashboard();
initFaqTracking();

function initThanksReferral() {
  const referral = document.getElementById("referral-link");
  const position = document.getElementById("waitlist-position");
  if (!referral || !position) return;
  const params = new URLSearchParams(location.search);
  const lead = params.get("lead") || "founding";
  const numeric = [...lead].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  position.textContent = `#${1000 + (numeric % 497)}`;
  referral.value = `${location.origin}/?utm_source=referral&utm_medium=waitlist&utm_campaign=founding_500&ref=${encodeURIComponent(lead)}`;
  document.getElementById("copy-referral")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(referral.value);
    track("referral_link_copied", { lead });
  });
}

initThanksReferral();
