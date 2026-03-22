import { describe, it, expect } from 'vitest'
import {
  getWeekString,
  getPreviousWeekString,
  getNextAssignee,
  filterActiveMembers,
  getWeekNumber,
  getWeekDateRange,
} from '../tareas'

// ─── getWeekString ───────────────────────────────────────────────────────────

describe('getWeekString', () => {
  it('returns ISO week format YYYY-WXX', () => {
    const result = getWeekString(new Date(2026, 0, 1)) // Thursday Jan 1 2026
    expect(result).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('January 1, 2026 (Thursday) → 2026-W01', () => {
    expect(getWeekString(new Date(2026, 0, 1))).toBe('2026-W01')
  })

  it('March 22, 2026 (Sunday) → 2026-W12', () => {
    // Sunday belongs to the week that started on Monday the 16th
    expect(getWeekString(new Date(2026, 2, 22))).toBe('2026-W12')
  })

  it('March 23, 2026 (Monday) → 2026-W13', () => {
    expect(getWeekString(new Date(2026, 2, 23))).toBe('2026-W13')
  })

  it('December 31, 2025 (Wednesday) → 2026-W01 (year boundary)', () => {
    expect(getWeekString(new Date(2025, 11, 31))).toBe('2026-W01')
  })

  it('December 28, 2025 (Sunday) → 2025-W52', () => {
    expect(getWeekString(new Date(2025, 11, 28))).toBe('2025-W52')
  })

  it('January 5, 2026 (Monday) → 2026-W02', () => {
    expect(getWeekString(new Date(2026, 0, 5))).toBe('2026-W02')
  })
})

// ─── getPreviousWeekString ───────────────────────────────────────────────────

describe('getPreviousWeekString', () => {
  it('previous week of March 22 2026 (W12) → W11', () => {
    const result = getPreviousWeekString(new Date(2026, 2, 22))
    expect(result).toBe('2026-W11')
  })

  it('previous week of Jan 5 2026 (W02) → W01', () => {
    const result = getPreviousWeekString(new Date(2026, 0, 5))
    expect(result).toBe('2026-W01')
  })

  it('handles year boundary: previous of W01 2026 → W52 2025', () => {
    // Jan 1 2026 is in W01; 7 days before = Dec 25 2025 which is in W52
    const result = getPreviousWeekString(new Date(2026, 0, 1))
    expect(result).toBe('2025-W52')
  })
})

// ─── getNextAssignee ─────────────────────────────────────────────────────────

describe('getNextAssignee', () => {
  const members = ['m1', 'm2', 'm3']

  it('returns first member when current is null', () => {
    expect(getNextAssignee(null, members)).toBe('m1')
  })

  it('returns next member in rotation', () => {
    expect(getNextAssignee('m1', members)).toBe('m2')
    expect(getNextAssignee('m2', members)).toBe('m3')
  })

  it('wraps around to first member after last', () => {
    expect(getNextAssignee('m3', members)).toBe('m1')
  })

  it('returns first member when current is not in list', () => {
    expect(getNextAssignee('unknown', members)).toBe('m1')
  })

  it('returns null when member list is empty', () => {
    expect(getNextAssignee('m1', [])).toBeNull()
    expect(getNextAssignee(null, [])).toBeNull()
  })

  it('returns same member when only one in list', () => {
    expect(getNextAssignee('m1', ['m1'])).toBe('m1')
  })

  it('handles two members correctly', () => {
    expect(getNextAssignee('a', ['a', 'b'])).toBe('b')
    expect(getNextAssignee('b', ['a', 'b'])).toBe('a')
  })
})

// ─── filterActiveMembers ────────────────────────────────────────────────────

describe('filterActiveMembers', () => {
  it('filters out members with null user_id', () => {
    const members = [
      { id: '1', user_id: 'u1', nombre: 'active1' },
      { id: '2', user_id: null, nombre: 'ghost' },
      { id: '3', user_id: 'u3', nombre: 'active2' },
    ]
    const result = filterActiveMembers(members)
    expect(result).toHaveLength(2)
    expect(result.map(m => m.id)).toEqual(['1', '3'])
  })

  it('returns empty when all members inactive', () => {
    const members = [
      { id: '1', user_id: null, nombre: 'gone1' },
      { id: '2', user_id: null, nombre: 'gone2' },
    ]
    expect(filterActiveMembers(members)).toHaveLength(0)
  })

  it('returns all when all members active', () => {
    const members = [
      { id: '1', user_id: 'u1', nombre: 'a' },
      { id: '2', user_id: 'u2', nombre: 'b' },
    ]
    expect(filterActiveMembers(members)).toHaveLength(2)
  })

  it('returns empty for empty input', () => {
    expect(filterActiveMembers([])).toHaveLength(0)
  })

  it('correctly identifies the "kalauu" bug — inactive member excluded', () => {
    // Simulates the reported bug: 4 active + 1 ghost member "kalauu"
    const members = [
      { id: '1', user_id: 'u1', nombre: 'lauta' },
      { id: '2', user_id: 'u2', nombre: 'caro' },
      { id: '3', user_id: 'u3', nombre: 'pepe' },
      { id: '4', user_id: 'u4', nombre: 'juan' },
      { id: '5', user_id: null, nombre: 'kalauu' },  // ghost — left the nido
    ]
    const active = filterActiveMembers(members)
    expect(active).toHaveLength(4)
    expect(active.find(m => m.nombre === 'kalauu')).toBeUndefined()
  })
})

// ─── getWeekNumber ──────────────────────────────────────────────────────────

describe('getWeekNumber', () => {
  it('extracts week number from week string', () => {
    expect(getWeekNumber('2026-W01')).toBe(1)
    expect(getWeekNumber('2026-W12')).toBe(12)
    expect(getWeekNumber('2025-W52')).toBe(52)
  })
})

// ─── getWeekDateRange ───────────────────────────────────────────────────────

describe('getWeekDateRange', () => {
  it('returns date range for W12 2026 (same month)', () => {
    // W12 2026: Monday March 16 – Sunday March 22
    const result = getWeekDateRange('2026-W12')
    expect(result).toBe('16–22 mar')
  })

  it('returns date range spanning two months', () => {
    // W05 2026: Monday Jan 26 – Sunday Feb 1
    const result = getWeekDateRange('2026-W05')
    expect(result).toBe('26 ene – 1 feb')
  })

  it('W01 2026: Monday Dec 29 2025 – Sunday Jan 4 2026', () => {
    const result = getWeekDateRange('2026-W01')
    expect(result).toBe('29 dic – 4 ene')
  })
})

// ─── Integration: rotation across weeks ─────────────────────────────────────

describe('rotation integration', () => {
  it('full rotation cycle with 3 members returns to original', () => {
    const members = ['m1', 'm2', 'm3']
    let current: string | null = 'm1'
    current = getNextAssignee(current, members) // m2
    current = getNextAssignee(current, members) // m3
    current = getNextAssignee(current, members) // m1
    expect(current).toBe('m1')
  })

  it('rotation skips removed member gracefully', () => {
    // Week 1: members are m1, m2, m3. Task assigned to m2.
    // Week 2: m2 leaves (filtered out). Active = m1, m3.
    // Next assignee after m2 should be m1 (m2 not in list → fallback to first)
    const activeMembersAfterLeave = ['m1', 'm3']
    const next = getNextAssignee('m2', activeMembersAfterLeave)
    expect(next).toBe('m1')
  })

  it('consecutive weeks produce sequential rotation', () => {
    const members = ['a', 'b', 'c', 'd']
    const assignments: (string | null)[] = []
    let current: string | null = null

    for (let w = 0; w < 8; w++) {
      current = getNextAssignee(current, members)
      assignments.push(current)
    }

    expect(assignments).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'])
  })
})
