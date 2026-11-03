import {
  GROK_AUTO_REVIEW_RESOLUTION,
  GROK_LOCAL_TOOL_RESOLUTION,
  type GrokAutoReviewResolution,
  type GrokLocalToolResolution
} from './types'
import type { GrokRpcRequest } from '@shared/ipc'
import type { ApprovalDecision } from '../types'

function isDeny(decision: ApprovalDecision): boolean {
  return decision === 'deny' || decision === 'deny_always'
}

/** Map BotHub Allow/Deny to Grok Auto-review proto enums. */
export function autoReviewResolutionFromDecision(decision: ApprovalDecision): GrokAutoReviewResolution {
  if (isDeny(decision)) return 'DENIED'
  if (decision === 'allow_always') return 'ALWAYS'
  return 'APPROVED'
}

export function localToolResolutionFromDecision(decision: ApprovalDecision): GrokLocalToolResolution {
  if (isDeny(decision)) return 'DENY'
  if (decision === 'allow_always') return 'ALWAYS'
  return 'ALLOW_ONCE'
}

/** Build main-process RPC request for an approval decision. */
export function grokApprovalRpcRequest(
  accountId: string,
  kind: 'auto-review' | 'local-tool' | 'connector',
  args: { agentId: string; requestId: string; decision: ApprovalDecision; sessionId?: string }
): GrokRpcRequest {
  if (kind === 'auto-review') {
    return {
      accountId,
      op: 'resolveAutoReview',
      agentId: args.agentId,
      requestId: args.requestId,
      resolution: GROK_AUTO_REVIEW_RESOLUTION[autoReviewResolutionFromDecision(args.decision)],
      sessionId: args.sessionId
    }
  }
  if (kind === 'local-tool') {
    return {
      accountId,
      op: 'resolveLocalTool',
      agentId: args.agentId,
      requestId: args.requestId,
      resolution: GROK_LOCAL_TOOL_RESOLUTION[localToolResolutionFromDecision(args.decision)],
      sessionId: args.sessionId
    }
  }
  return {
    accountId,
    op: 'resolveConnectorGrant',
    agentId: args.agentId,
    requestId: args.requestId,
    resolution: isDeny(args.decision) ? 2 : 1,
    sessionId: args.sessionId
  }
}
