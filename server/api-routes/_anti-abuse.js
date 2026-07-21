const recentSubmissions = new Map();

const HONEYPOT_FIELDS = ["website", "url", "homepage", "_gotcha", "faxNumber"];
const BOT_UA_PATTERN = /bot|crawl|spider|headless|python|curl|wget|httpclient|go-http-client|scrapy|playwright|puppeteer/i;
const SPAM_WORD_PATTERN = /\b(casino|crypto|forex|loan|viagra|porn|escort|backlink|seo package|guest post)\b/i;
const FORM_INTENT = "forsig-public-form";

function getIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  return req.socket?.remoteAddress || "unknown";
}

function value(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasHoneypot(body) {
  return HONEYPOT_FIELDS.some((field) => value(body?.[field]));
}

function uniqueCharacters(text) {
  return new Set(text.toLowerCase().split("")).size;
}

function caseTransitions(text) {
  let transitions = 0;
  for (let index = 1; index < text.length; index += 1) {
    const previous = text[index - 1];
    const current = text[index];
    if (/[a-z]/.test(previous) && /[A-Z]/.test(current)) transitions += 1;
    if (/[A-Z]/.test(previous) && /[a-z]/.test(current)) transitions += 1;
  }
  return transitions;
}

export function isLikelyRandomToken(input) {
  const text = value(input);
  if (text.length < 12 || /\s/.test(text) || !/^[a-z0-9]+$/i.test(text)) return false;
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length < 10) return false;
  const vowelRatio = (letters.match(/[aeiou]/gi) || []).length / letters.length;
  const transitionRatio = caseTransitions(text) / text.length;
  const uniquenessRatio = uniqueCharacters(text) / text.length;
  return vowelRatio < 0.28 || transitionRatio > 0.35 || uniquenessRatio > 0.62;
}

function hasTooManyLinks(text) {
  const matches = value(text).match(/https?:\/\/|www\.|\.ru\b|\.xyz\b|\.top\b|\.click\b/gi);
  return (matches || []).length > 1;
}

function isMeaninglessMessage(input) {
  const text = value(input);
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1 && isLikelyRandomToken(words[0])) return true;
  if (text.length < 18 && words.length < 3 && !/[?.!,]/.test(text)) return true;
  return false;
}

function isDuplicateBurst(type, body, req, now) {
  const email = value(body?.email).toLowerCase();
  const key = `${type}:${email || getIp(req)}`;
  const lastSeen = recentSubmissions.get(key);
  recentSubmissions.set(key, now);

  if (recentSubmissions.size > 5000) {
    for (const [entryKey, timestamp] of recentSubmissions.entries()) {
      if (now - timestamp > 60 * 60 * 1000) recentSubmissions.delete(entryKey);
    }
  }

  const cooldownMs = type === "contact" ? 10 * 60 * 1000 : 90 * 1000;
  return Boolean(lastSeen && now - lastSeen < cooldownMs);
}

function sameSiteSignal(req) {
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  if (!host) return "missing";

  try {
    if (typeof origin === "string" && origin) {
      return new URL(origin).host === host ? "same" : "bad";
    }
    if (typeof referer === "string" && referer) {
      return new URL(referer).host === host ? "same" : "bad";
    }
  } catch {
    return "bad";
  }

  return "missing";
}

export function analyzePublicSubmission(req, body = {}, { type = "waitlist" } = {}) {
  const now = Date.now();
  const reasons = [];
  let score = 0;

  if (hasHoneypot(body)) {
    reasons.push("honeypot");
    score += 10;
  }

  const startedAt = Number(body.formStartedAt || body.startedAt || body._startedAt);
  if (!Number.isFinite(startedAt)) {
    reasons.push("missing_form_timer");
    score += type === "contact" ? 2 : 1;
  } else {
    const elapsedMs = now - startedAt;
    if (elapsedMs >= 0 && elapsedMs < (type === "contact" ? 3500 : 1800)) {
      reasons.push("submitted_too_fast");
      score += type === "contact" ? 4 : 3;
    }
    if (elapsedMs < -60_000 || elapsedMs > 24 * 60 * 60 * 1000) {
      reasons.push("invalid_form_timer");
      score += 2;
    }
  }

  if (value(body.formIntent) !== FORM_INTENT) {
    reasons.push("missing_form_intent");
    score += 2;
  }

  const siteSignal = sameSiteSignal(req);
  if (siteSignal === "bad") {
    reasons.push("bad_origin");
    score += 10;
  } else if (siteSignal === "missing") {
    reasons.push("missing_origin");
    score += 2;
  }

  const userAgent = value(req.headers?.["user-agent"]);
  if (!userAgent || BOT_UA_PATTERN.test(userAgent)) {
    reasons.push("bot_user_agent");
    score += 3;
  }

  if (isLikelyRandomToken(body.name)) {
    reasons.push("random_name");
    score += 4;
  }
  if (isLikelyRandomToken(body.company)) {
    reasons.push("random_company");
    score += 3;
  }
  if (type === "contact" && isMeaninglessMessage(body.message)) {
    reasons.push("meaningless_message");
    score += 5;
  }
  if (hasTooManyLinks(`${value(body.message)} ${value(body.useCase)} ${value(body.company)}`)) {
    reasons.push("link_spam");
    score += 5;
  }
  if (SPAM_WORD_PATTERN.test(`${value(body.message)} ${value(body.useCase)} ${value(body.company)}`)) {
    reasons.push("spam_keywords");
    score += 5;
  }
  if (isDuplicateBurst(type, body, req, now)) {
    reasons.push("submission_cooldown");
    score += type === "contact" ? 4 : 3;
  }

  const threshold = type === "contact" ? 6 : 8;
  return {
    blocked: score >= threshold,
    score,
    reasons,
    ip: getIp(req)
  };
}

export function publicSuccessResponse(type) {
  if (type === "contact") {
    return { ok: true, message: "Message sent. Check your inbox for confirmation." };
  }
  return {
    ok: true,
    duplicate: false,
    leadId: "lead_pending",
    referralCode: "",
    message: "You are on the beta list."
  };
}
