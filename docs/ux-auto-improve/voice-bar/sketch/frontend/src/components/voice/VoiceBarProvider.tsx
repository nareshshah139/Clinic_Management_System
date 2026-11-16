// Repo path: frontend/src/components/voice/VoiceBarProvider.tsx
// The registry. Pages write to it through useVoiceCapability(); the bar reads it.
// Every registrant owns its own slot, keyed by a RegistrantId it got on mount. Nobody overwrites
// anybody. The read side derives "active" as the most recently mounted slot.

'use client';

import type { JSX, ReactNode } from 'react';
import type { VoiceCapability } from '@/lib/voice/types';
import type { RegistrantId, RegistrationKey } from '@/lib/voice/machine';

export interface VoiceRegistry {
  /** Adds a slot read live through `read`. `changed()` notifies listeners after intent or scope changed. */
  register(read: () => VoiceCapability): { id: RegistrantId; changed(): void; unregister(): void };
  /** The newest live slot with its key read now: { registrant, intent, scope ?? null }. */
  active(): { key: RegistrationKey; capability: VoiceCapability } | null;
  subscribe(listener: () => void): () => void;
}

export function createVoiceRegistry(): VoiceRegistry { throw new Error('not implemented'); }

export function VoiceBarProvider({ children }: { children: ReactNode }): JSX.Element {
  // const [registry] = useState(createVoiceRegistry);   // no side effects in the initializer
  // return <VoiceRegistryContext.Provider value={registry}>{children}</VoiceRegistryContext.Provider>
  throw new Error('not implemented');
}

/**
 * @cc [owner:nareshshah139,label:product] voice-capability-registration
 * A component MUST offer voice only by calling this hook with one capability or null; the bar MUST
 * show only while a capability is registered, MUST treat (registrant, intent, scope) as the
 * registration's identity, and MUST call the latest render's apply.
 */
export function useVoiceCapability(capability: VoiceCapability | null): void {
  // const registry = useContext(VoiceRegistryContext)        // null outside a provider -> no-op
  // const latest = useRef(capability); latest.current = capability;   // fresh closures, no re-register
  // const present = capability !== null
  // const handle = useRef<ReturnType<VoiceRegistry['register']> | null>(null)
  // useEffect(() => {
  //   if (!registry || !present) return;
  //   handle.current = registry.register(() => latest.current!);
  //   return () => { handle.current?.unregister(); handle.current = null; };   // Strict Mode: register, unregister, register
  // }, [registry, present]);
  // useEffect(() => { handle.current?.changed(); }, [capability?.intent, capability?.scope]);
  throw new Error('not implemented');
}

/** For the bar only. */
export function useVoiceRegistry(): VoiceRegistry | null { throw new Error('not implemented'); }
