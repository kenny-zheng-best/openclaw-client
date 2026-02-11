export type SectionKey = 'agent' | 'skills' | 'automation' | 'models'

export interface NavigationState {
  section: SectionKey
  agentExpanded: boolean
}

/**
 * Invariant: switching sidebar tabs must not mutate agentExpanded.
 * Agent expand/collapse is a user-owned UI preference, independent from current section.
 */
export function navigateSection(
  current: NavigationState,
  nextSection: SectionKey,
): NavigationState {
  return {
    section: nextSection,
    agentExpanded: current.agentExpanded,
  }
}
