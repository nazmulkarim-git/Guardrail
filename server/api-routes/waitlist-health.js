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
      max: 1,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "false" ? false : "require"
    });
  }
  return sql;
}

function publicDatabaseError(error) {
  if (error.code === "missing_database_url") return "missing_database_url";
  if (error.code === "42P01") return "missing_waitlist_table";
  if (error.code === "42703") return "waitlist_schema_mismatch";
  if (error.code === "28P01") return "database_auth_failed";
  if (error.code === "3D000") return "database_not_found";
  if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") return "database_connection_failed";
  return error.code || error.name || "database_check_failed";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const db = getSql();
    const result = await db`
      select
        count(*)::int as lead_count
      from waitlist_leads
    `;

    res.status(200).json({
      ok: true,
      database: "connected",
      table: "waitlist_leads",
      leadCount: result[0]?.lead_count ?? 0
    });
  } catch (error) {
    console.error("Waitlist health failed", {
      code: error.code,
      name: error.name,
      message: error.message,
      detail: error.detail,
      hint: error.hint
    });
    res.status(500).json({
      ok: false,
      code: publicDatabaseError(error),
      error: "Waitlist database health check failed."
    });
  }
}
