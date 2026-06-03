import { apiError, getSql, json, newId, publicApiError, requireDeveloper, toJson } from "../_forsig-core.js";

const samples = [
  {
    agent: "Refund Agent",
    runId: "run_demo_refund",
    workflow: "refund-review-flow",
    step: "approval",
    riskType: "refund_over_limit",
    riskLevel: "high",
    riskReason: "Refund amount exceeds the normal approval limit.",
    title: "Approve refund for customer #123",
    description: "The agent wants to issue a $500 refund to a VIP customer.",
    proposedAction: "Issue a $500 refund",
    context: {
      customerTier: "VIP",
      orderValue: 1200,
      refundAmount: 500,
      reason: "Product failed twice"
    }
  },
  {
    agent: "Sales Agent",
    runId: "run_demo_sales",
    workflow: "enterprise-outreach",
    step: "custom-offer",
    riskType: "external_message",
    riskLevel: "medium",
    riskReason: "The email includes a non-standard discount offer.",
    title: "Review custom offer email",
    description: "The agent wants to send a 30% discount offer to an enterprise prospect.",
    proposedAction: "Send custom discount email",
    context: {
      prospect: "Enterprise account",
      dealValue: 18000,
      proposedDiscount: "30%",
      normalDiscountBand: "10-15%"
    }
  },
  {
    agent: "Deploy Agent",
    runId: "run_demo_deploy",
    workflow: "release-flow",
    step: "migration",
    riskType: "deployment_action",
    riskLevel: "critical",
    riskReason: "Migration touches production billing records.",
    title: "Review production migration",
    description: "The agent wants to run a production database migration.",
    proposedAction: "Run production billing migration",
    context: {
      environment: "production",
      table: "billing_accounts",
      rollbackPlan: "attached",
      reviewerRequired: "engineering_lead"
    }
  }
];

export default async function handler(req, res) {
  const session = requireDeveloper(req, res);
  if (!session) return;
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    apiError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  try {
    const db = getSql();
    const countRows = await db`
      select count(*)::int as count
      from escalations
      where workspace_id = ${session.workspaceId}
    `;
    const sample = samples[(countRows[0]?.count || 0) % samples.length];
    const escalationId = newId("esc");
    const auditId = newId("audit");

    await db.begin(async (tx) => {
      await tx`
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
          allowed_actions_json,
          notify_channels_json,
          test_mode,
          created_at,
          updated_at
        )
        values (
          ${escalationId},
          ${session.workspaceId},
          'developer_portal_demo',
          ${sample.agent.toLowerCase().replaceAll(" ", "-")},
          ${sample.agent},
          ${sample.runId},
          ${sample.workflow},
          ${sample.step},
          'pending',
          ${sample.riskType},
          ${sample.riskLevel},
          ${sample.riskReason},
          ${sample.title},
          ${sample.description},
          ${sample.proposedAction},
          true,
          ${toJson(sample.context)},
          ${toJson(["approve", "reject", "edit", "add_context", "take_over", "needs_more_info"])},
          ${toJson(["dashboard"])},
          'manual',
          now(),
          now()
        )
      `;
      await tx`
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
          ${auditId},
          ${session.workspaceId},
          ${escalationId},
          'system',
          'developer_portal',
          'escalation.demo_created',
          ${toJson({ source: "developer_portal", riskType: sample.riskType })},
          now()
        )
      `;
    });

    json(res, 201, { ok: true, escalationId });
  } catch (error) {
    const publicError = publicApiError(error);
    console.error("Developer test escalation failed", { code: error.code, message: error.message, detail: error.detail });
    apiError(res, publicError.status, publicError.code, publicError.message);
  }
}
