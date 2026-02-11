import { describe, expect, it } from 'vitest'

import { navigateSection } from './navigation'

describe('navigateSection', () => {
  it('keeps agentExpanded=true when switching from agent to skills', () => {
    const next = navigateSection({ section: 'agent', agentExpanded: true }, 'skills')

    expect(next.section).toBe('skills')
    expect(next.agentExpanded).toBe(true)
  })

  it('keeps agentExpanded=false when switching tabs', () => {
    const next = navigateSection({ section: 'agent', agentExpanded: false }, 'models')

    expect(next.section).toBe('models')
    expect(next.agentExpanded).toBe(false)
  })

  it('updates section normally while preserving expansion state', () => {
    const next = navigateSection({ section: 'skills', agentExpanded: true }, 'automation')

    expect(next).toEqual({ section: 'automation', agentExpanded: true })
  })
})
