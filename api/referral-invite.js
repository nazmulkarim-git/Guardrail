function normalizeString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseEmails(value) {
  return [...new Set(
    normalizeString(value)
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendInvite({ to, referralCode, referralLink }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.WAITLIST_FROM_EMAIL || "Forsig <hello@forsig.com>",
      to: [to],
      reply_to: process.env.WAITLIST_REPLY_TO || "hello@forsig.com",
      subject: "You were invited to the Forsig private beta",
      html: `
        <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
          <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
            <p style="margin:0 0 12px;color:#d7ff72;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig referral</p>
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">You were invited to join Forsig.</h1>
            <p style="color:#c9cedd;line-height:1.65">Forsig is a budget firewall for AI agents. It helps builders block runaway loops, cap spend, log token usage, and pause risky agent traffic before provider bills spiral.</p>
            <p style="color:#c9cedd;line-height:1.65">Use this referral code when you join: <strong>${escapeHtml(referralCode)}</strong></p>
            <p style="margin:26px 0">
              <a href="${escapeHtml(referralLink)}" style="display:inline-block;background:#d7ff72;color:#10110d;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:800">Join the Forsig private beta</a>
            </p>
            <p style="color:#8f96aa;line-height:1.55">If you were not expecting this invite, you can ignore this email.</p>
          </div>
        </div>
      `
    })
  });

  if (!response.ok) {
    return { sent: false, status: response.status, body: await response.text() };
  }
  return { sent: true, response: await response.json() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      res.status(503).json({ ok: false, error: "Email sending is not configured." });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const referralCode = normalizeString(body.referralCode);
    const referralLink = normalizeString(body.referralLink);
    const emails = parseEmails(body.inviteEmails);

    if (!referralCode || !referralLink) {
      res.status(400).json({ ok: false, error: "Referral link and code are required." });
      return;
    }

    if (!emails.length) {
      res.status(400).json({ ok: false, error: "Enter at least one email address." });
      return;
    }

    const invalid = emails.filter((email) => !isEmail(email));
    if (invalid.length) {
      res.status(400).json({ ok: false, error: `Invalid email: ${invalid[0]}` });
      return;
    }

    if (emails.length > 10) {
      res.status(400).json({ ok: false, error: "Send up to 10 referral emails at a time." });
      return;
    }

    const results = await Promise.allSettled(
      emails.map((email) => sendInvite({ to: email, referralCode, referralLink }))
    );
    const sent = results.filter((result) => result.status === "fulfilled" && result.value.sent).length;

    if (!sent) {
      res.status(502).json({ ok: false, error: "No referral emails were sent. Please try again." });
      return;
    }

    res.status(200).json({ ok: true, sent, requested: emails.length });
  } catch (error) {
    console.error("Referral invites failed", {
      name: error.name,
      message: error.message
    });
    res.status(500).json({ ok: false, error: "Referral emails could not be sent. Please try again." });
  }
}
