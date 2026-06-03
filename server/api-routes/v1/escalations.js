import {
  apiError,
  authenticateRequest,
  compactEscalation,
  getSql,
  json,
  newId,
  normalizeString,
  publicApiError,
  readBody,
  requireMethod,
  sendEmail,
  sendSlackNotification,
  toJson
} from "../_forsig-core.js";

function normalizeRisk(value) {
  if (typeof value === "string") return { type: value, level: null, reason: null };
  if (!value || typeof value !== "object") return { type: null, level: null, reason: null };
  return {
    type: normalizeString(value.type),
    level: normalizeString(value.level),
    reason: normalizeString(value.reason)
  };
}

function normalizeAgent(value) {
  if (typeof value === "string") return { id: value, name: value };
  if (!value || typeof value !== "object") return { id: null, name: null };
  return {
    id: normalizeString(value.id) || normalizeString(value.externalId) || normalizeString(value.name),
    name: normalizeString(value.name) || normalizeString(value.id)
  };
}

function normalizeRun(body) {
  const run = body.run && typeof body.run === "object" ? body.run : {};
  return {
    id: normalizeString(body.runId) || normalizeString(run.id),
    workflow: normalizeString(body.workflow) || normalizeString(run.workflow),
    step: normalizeString(body.step) || normalizeString(run.step),
    attempt: Number.isFinite(Number(run.attempt)) ? Number(run.attempt) : null
  };
}

function normalizeTask(body) {
  const task = body.task && typeof body.task === "object" ? body.task : {};
  return {
    title: normalizeString(typeof body.task === "string" ? body.task : task.title),
    description: normalizeString(task.description),
    proposedAction: normalizeString(body.proposedAction) || normalizeString(body.proposed_action) || normalizeString(task.proposedAction) || normalizeString(task.proposed_action),
    customerImpact: Boolean(task.customerImpact ?? task.customer_impact ?? false)
  };
}

function dashboardUrl(req, escalationId) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.forsig.com";
  return `${proto}://${host}/developer?esc=${encodeURIComponent(escalationId)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEscalationNotification(req, escalation, parsed) {
  const reviewerEmail = parsed.reviewerEmails?.[0] || process.env.FORSIG_REVIEWER_EMAIL || process.env.WAITLIST_OWNER_EMAIL;
  if (!reviewerEmail) return { sent: false, reason: "No reviewer email configured" };
  const reviewUrl = dashboardUrl(req, escalation.id);
  return sendEmail({
    to: reviewerEmail,
    subject: `Forsig: ${parsed.agent.name || parsed.agent.id} needs approval`,
    html: `
      <div style="margin:0;background:#07080c;color:#f7f8ff;font-family:Inter,Arial,sans-serif;padding:32px">
        <div style="max-width:620px;margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:30px;background:#111522">
          <p style="margin:0 0 12px;color:#00ffc2;text-transform:uppercase;font-size:12px;letter-spacing:.08em;font-weight:700">Forsig approval needed</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.1">${escapeHtml(parsed.task.title)}</h1>
          <p style="color:#c9cedd;line-height:1.65"><strong>Agent:</strong> ${escapeHtml(parsed.agent.name || parsed.agent.id)}</p>
          <p style="color:#c9cedd;line-height:1.65"><strong>Risk:</strong> ${escapeHtml(parsed.risk.type)}${parsed.risk.level ? ` · ${escapeHtml(parsed.risk.level)}` : ""}</p>
          <p style="color:#c9cedd;line-height:1.65"><strong>Proposed action:</strong> ${escapeHtml(parsed.task.proposedAction)}</p>
          <p style="margin:24px 0"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#00ffc2;color:#06120f;text-decoration:none;border-radius:10px;padding:12px 16px;font-weight:800">Open in Forsig</a></p>
          <p style="color:#8f96aa;word-break:break-all">${escapeHtml(reviewUrl)}</p>
        </div>
      </div>
    `
  });
}

export function validateEscalationPayload(body) {
  const agent = normalizeAgent(body.agent);
  const run = normalizeRun(body);
  const risk = normalizeRisk(body.risk);
  const task = normalizeTask(body);
  const review = body.review && typeof body.review === "object" ? body.review : {};
  const directReviewerEmail = normalizeString(review.reviewerEmail || review.reviewer_email);
  const reviewerEmails = Array.isArray(review.reviewerEmails)
    ? review.reviewerEmails.map(normalizeString).filter(Boolean)
    : directReviewerEmail
      ? [directReviewerEmail]
      : [];
  const assignedReviewerEmail = normalizeString(review.assignedReviewerEmail || review.assigned_reviewer_email) || reviewerEmails[0] || null;
  const testMode = normalizeString(review.testMode || review.test_mode || body.testMode || body.test_mode);
  const errors = [];
  if (!agent.id) errors.push("agent is required.");
  if (!task.title) errors.push("task title is required.");
  if (!risk.type) errors.push("risk type is required.");
  if (!task.proposedAction) errors.push("proposedAction is required.");
  return { valid: errors.length === 0, errors, agent, run, risk, task, review, reviewerEmails, assignedReviewerEmail, testMode };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    const db = getSql();
    const auth = await authenticateRequest(req, db);
    if (!auth.ok) {
      apiError(res, auth.status, auth.code, auth.message);
      return;
    }

    const body = readBody(req);
    const parsed = validateEscalationPayload(body);
    if (!parsed.valid) {
      apiError(res, 400, "invalid_escalation", parsed.errors.join(" "));
      return;
    }

    const id = newId("esc");
    const nowRows = await db`select now() as now`;
    const createdAt = nowRows[0].now;
    const timeoutSeconds = Number(body.timeoutSeconds ?? body.timeout_seconds ?? parsed.review.timeoutSeconds ?? parsed.review.timeout_seconds ?? null);
    const timeoutAt = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
      ? new Date(Date.now() + timeoutSeconds * 1000)
      : null;

    const rows = await db`
      insert into escalations (
        id,
        workspace_id,
        api_key_id,
        external_agent_id,
        agent_name,
        run_id,
        workflow_name,
        workflow_step,
        status,
        risk_type,
        risk_level,
        risk_reason,
        task_title,
        task_description,
        proposed_action,
        customer_impact,
        context_json,
        trace_json,
        model_json,
        allowed_actions_json,
        notify_channels_json,
        callback_url,
        assigned_reviewer_email,
        test_mode,
        timeout_at,
        created_at,
        updated_at
      )
      values (
        ${id},
        ${auth.workspaceId},
        ${auth.apiKeyId},
        ${parsed.agent.id},
        ${parsed.agent.name},
        ${parsed.run.id},
        ${parsed.run.workflow},
        ${parsed.run.step},
        'pending',
        ${parsed.risk.type},
        ${parsed.risk.level},
        ${parsed.risk.reason},
        ${parsed.task.title},
        ${parsed.task.description},
        ${parsed.task.proposedAction},
        ${parsed.task.customerImpact},
        ${toJson(body.context)},
        ${toJson(body.trace)},
        ${toJson(body.model)},
        ${toJson(parsed.review.allowed_actions || parsed.review.allowedActions || body.allowedActions || body.allowed_actions || ["approve", "reject", "edit", "add_context", "take_over", "needs_more_info"])},
        ${toJson(parsed.review.notify || body.notify || body.notifyChannels || body.notify_channels || ["dashboard"])},
        ${normalizeString(parsed.review.callback_url) || normalizeString(parsed.review.callbackUrl) || normalizeString(body.callbackUrl) || normalizeString(body.callback_url)},
        ${parsed.assignedReviewerEmail},
        ${parsed.testMode},
        ${timeoutAt},
        ${createdAt},
        ${createdAt}
      )
      returning *
    `;

    await db`
      insert into audit_events (
        id,
        workspace_id,
        escalation_id,
        actor_type,
        actor_id,
        event_type,
        metadata_json,
        created_at
      )
      values (
        ${newId("audit")},
        ${auth.workspaceId},
        ${id},
        'agent',
        ${parsed.agent.id},
        'escalation.created',
        ${toJson({ apiKeyId: auth.apiKeyId, risk: parsed.risk, task: parsed.task.title })},
        ${createdAt}
      )
    `;

    if (!parsed.reviewerEmails.length) {
      const agentRows = await db`
        select default_reviewer_emails
        from agents
        where workspace_id = ${auth.workspaceId}
          and archived_at is null
          and (slug = ${parsed.agent.id} or id = ${parsed.agent.id})
        limit 1
      `.catch(() => []);
      const agentEmails = agentRows[0]?.default_reviewer_emails;
      if (Array.isArray(agentEmails)) parsed.reviewerEmails = agentEmails.map(normalizeString).filter(Boolean);
      if (!parsed.assignedReviewerEmail && parsed.reviewerEmails[0]) {
        parsed.assignedReviewerEmail = parsed.reviewerEmails[0];
        rows[0].assigned_reviewer_email = parsed.assignedReviewerEmail;
        await db`
          update escalations
          set assigned_reviewer_email = ${parsed.assignedReviewerEmail}
          where id = ${id}
            and workspace_id = ${auth.workspaceId}
        `.catch(() => null);
      }
    }

    const notification = await sendEscalationNotification(req, rows[0], parsed).catch((error) => {
      console.error("Escalation notification failed", { escalationId: id, message: error.message });
      return { sent: false, error: error.message };
    });

    const rawNotifyChannels = parsed.review.notify || body.notify || body.notifyChannels || body.notify_channels || ["dashboard"];
    const notifyChannels = Array.isArray(rawNotifyChannels) ? rawNotifyChannels : [rawNotifyChannels].filter(Boolean);
    const wantsSlack = notifyChannels.includes("slack");
    if (wantsSlack) {
      const reviewUrl = dashboardUrl(req, id);
      const slackResult = await sendSlackNotification({
        text: `Forsig approval needed: ${parsed.task.title}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${parsed.task.title}*\n*Agent:* ${parsed.agent.name || parsed.agent.id}\n*Risk:* ${parsed.risk.type}${parsed.risk.level ? ` · ${parsed.risk.level}` : ""}\n*Proposed action:* ${parsed.task.proposedAction}`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Review in Forsig" },
                url: reviewUrl
              }
            ]
          }
        ]
      }).catch((error) => ({ sent: false, error: error.message }));

      await db`
        insert into notification_attempts (
          id,
          workspace_id,
          escalation_id,
          channel,
          recipient,
          status,
          error,
          created_at,
          sent_at
        )
        values (
          ${newId("note")},
          ${auth.workspaceId},
          ${id},
          'slack',
          ${process.env.FORSIG_SLACK_WEBHOOK_URL ? 'configured_webhook' : 'unconfigured'},
          ${slackResult.sent ? 'sent' : 'failed'},
          ${slackResult.sent ? null : slackResult.reason || slackResult.error || slackResult.body || 'Slack not sent'},
          ${createdAt},
          ${slackResult.sent ? createdAt : null}
        )
      `.catch((error) => {
        console.error("Slack notification attempt log failed", { escalationId: id, code: error.code, message: error.message });
      });
    }

    await db`
      insert into notification_attempts (
        id,
        workspace_id,
        escalation_id,
        channel,
        recipient,
        status,
        error,
        created_at,
        sent_at
      )
      values (
        ${newId("note")},
        ${auth.workspaceId},
        ${id},
        'email',
        ${parsed.reviewerEmails?.[0] || process.env.FORSIG_REVIEWER_EMAIL || process.env.WAITLIST_OWNER_EMAIL || 'unconfigured'},
        ${notification.sent ? 'sent' : 'failed'},
        ${notification.sent ? null : notification.reason || notification.error || notification.body || 'Email not sent'},
        ${createdAt},
        ${notification.sent ? createdAt : null}
      )
    `.catch((error) => {
      console.error("Notification attempt log failed", { escalationId: id, code: error.code, message: error.message });
    });

    json(res, 201, {
      ok: true,
      id,
      status: "pending",
      dashboard_url: dashboardUrl(req, id),
      created_at: createdAt,
      expires_at: timeoutAt,
      assigned_reviewer_email: parsed.assignedReviewerEmail,
      test_mode: parsed.testMode,
      escalation: compactEscalation(rows[0]),
      dashboardUrl: dashboardUrl(req, id),
      decisionUrl: `/api/v1/escalations/${id}/decision`,
      notification: { sent: Boolean(notification.sent) }
    });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Create escalation failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
