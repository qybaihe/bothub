/**
 * Shared Agent Noise connectionClass helpers (protocol.md §3.3 / GAPS §1.B).
 *
 * Personal Muse uses connectionClass hatch_vm (Msg1 freshness nonce, Msg3 empty).
 * Shared Agent remote.* uses connectionClass shared_agent:
 *   Msg1 = protobuf field 2 = 1 (no nonce)
 *   Msg3 = fresh ticket bytes
 *
 * Ticket / grant bootstrap (where the ticket bytes come from before WSS) is
 * NOT fully captured from muse.ai JS in-repo — do not invent HTTPS endpoints.
 * Probe shared_agents.capabilities / list on the personal hatch_vm gateway;
 * keep remote.open/send honest-unavailable until ticket acquisition is proven.
 */
import { PbWriter } from "./protobuf"

export type MuseNoiseConnectionClass = "hatch_vm" | "shared_agent"

/** Msg1 payload for shared_agent: Writer.uint32(16).int32(1). */
export function sharedAgentMsg1Payload(): Uint8Array {
  return new PbWriter().uint(2, 1).finish()
}

export function assertSharedAgentTicket(ticket: Uint8Array | undefined): Uint8Array {
  if (!ticket || ticket.byteLength === 0) {
    throw new Error(
      "Shared Agent Msg3 ticket missing — remote Noise connect blocked until ticket bootstrap is captured"
    )
  }
  return ticket
}
