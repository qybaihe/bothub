import {
  GROK_AUTO_REVIEW_RESOLUTION,
  GROK_LOCAL_TOOL_RESOLUTION,
  type GrokAutoReviewResolution,
  type GrokLocalToolResolution
} from "./types"
import type { GrokConnectClient } from "./connectClient"
import type { ApprovalDecision } from "../types"

function isDeny(decision: ApprovalDecision): boolean {
  return decision === "deny" || decision === "deny_always"
}

/** Map BotHub Allow/Deny to Grok Auto-review proto enums. */
export function autoReviewResolutionFromDecision(decision: ApprovalDecision): GrokAutoReviewResolution {
  if (isDeny(decision)) return "DENIED"
  if (decision === "allow_always") return "ALWAYS"
  return "APPROVED"
}

export function localToolResolutionFromDecision(decision: ApprovalDecision): GrokLocalToolResolution {
  if (isDeny(decision)) return "DENY"
  if (decision === "allow_always") return "ALWAYS"
  return "ALLOW_ONCE"
}

export async function resolveGrokApproval(
  client: GrokConnectClient,
  kind: "auto-review" | "local-tool" | "connector",
  args: { agentId: string; requestId: string; decision: ApprovalDecision; sessionId?: string }
): Promise<unknown> {
  if (kind === "auto-review") {
    const resolution = GROK_AUTO_REVIEW_RESOLUTION[autoReviewResolutionFromDecision(args.decision)]
    return client.resolveAutoReview({
      agentId: args.agentId,
      requestId: args.requestId,
      resolution,
      sessionId: args.sessionId
    })
  }
  if (kind === "local-tool") {
    const resolution = GROK_LOCAL_TOOL_RESOLUTION[localToolResolutionFromDecision(args.decision)]
    return client.resolveLocalTool({
      agentId: args.agentId,
      requestId: args.requestId,
      resolution,
      sessionId: args.sessionId
    })
  }
  // Connector grant enum not fully documented — mirror APPROVED=1 / DENIED=2.
  const resolution = isDeny(args.decision) ? 2 : 1
  return client.resolveConnectorGrant({
    agentId: args.agentId,
    requestId: args.requestId,
    resolution,
    sessionId: args.sessionId
  })
}
