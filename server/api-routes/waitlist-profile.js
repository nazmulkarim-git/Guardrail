import postgres from "postgres";

let sql;

function getSql() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured.");
    error.code = "missing_database_url";
    throw error;
  }
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      max: 2,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "false" ? false : "require"
    });
  }
  return sql;
}

function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function publicDatabaseError(error) {
  if (error.code === "missing_database_url") return { status: 503, message: "DATABASE_URL is not configured." };
  if (error.code === "42P01") return { status: 500, message: "The waitlist_leads table does not exist." };
  if (error.code === "42703") return { status: 500, message: "The waitlist_leads table is missing optional profile columns." };
  return { status: 500, message: "Profile update failed. Please try again." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const leadId = normalizeString(body.leadId);
    if (!leadId) {
      res.status(400).json({ ok: false, error: "Lead id is required." });
      return;
    }

    const rows = await getSql()`
      update waitlist_leads set
        name = coalesce(${normalizeString(body.name)}, name),
        company = coalesce(${normalizeString(body.company)}, company),
        role = coalesce(${normalizeString(body.role)}, role),
        provider = coalesce(${normalizeString(body.provider)}, provider),
        use_case = coalesce(${normalizeString(body.useCase)}, use_case),
        monthly_ai_spend = coalesce(${normalizeString(body.monthlyAiSpend)}, monthly_ai_spend),
        monthly_token_volume = coalesce(${normalizeString(body.monthlyTokenVolume)}, monthly_token_volume),
        updated_at = now()
      where id = ${leadId}
      returning id
    `;

    if (!rows[0]) {
      res.status(404).json({ ok: false, error: "Waitlist signup not found." });
      return;
    }

    res.status(200).json({ ok: true, leadId: rows[0].id });
  } catch (error) {
    const publicError = publicDatabaseError(error);
    console.error("Waitlist profile update failed", {
      code: error.code,
      name: error.name,
      message: error.message,
      detail: error.detail
    });
    res.status(publicError.status).json({ ok: false, error: publicError.message });
  }
}
