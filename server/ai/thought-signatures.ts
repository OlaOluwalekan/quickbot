import "server-only";

/**
 * F4.4b — which thought signature goes with the tool call of one model turn.
 *
 * Thinking models need the signature of their own function call sent back,
 * unchanged, when the call is replayed in the next request. The provider
 * normally reports it on the call itself (`tool_call.thoughtSignature`), but
 * it may also arrive as a separate `thought_signature` event, before or after
 * the call. This keeps the last one seen in the turn and gives it to the call:
 * - the call's own signature always wins;
 * - otherwise the last signature seen before the call;
 * - otherwise the first one that arrives after it.
 *
 * Use one tracker per model call (per turn of the tool loop).
 */
export function createTurnSignatureTracker() {
  let latest: string | undefined;
  let call: { thoughtSignature?: string } | null = null;

  return {
    /** Record a `thought_signature` event. */
    onSignature(signature: string) {
      latest = signature;
      if (call && !call.thoughtSignature) call.thoughtSignature = signature;
    },
    /**
     * Attach the right signature to a tool call (mutates and returns it).
     * A signature that arrives later is attached to this call too.
     */
    attach<T extends { thoughtSignature?: string }>(toolCall: T): T {
      toolCall.thoughtSignature = toolCall.thoughtSignature || latest;
      call = toolCall;
      return toolCall;
    },
  };
}
