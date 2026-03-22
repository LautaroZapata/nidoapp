/**
 * Get ISO 8601 week string: "YYYY-WXX"
 */
export function getWeekString(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`
}

/**
 * Get the week string for 7 days before the given date
 */
export function getPreviousWeekString(date: Date = new Date()): string {
  const prev = new Date(date)
  prev.setDate(prev.getDate() - 7)
  return getWeekString(prev)
}

/**
 * Get the next member in circular rotation
 */
export function getNextAssignee(
  currentAssigneeId: string | null,
  memberIds: string[],
): string | null {
  if (memberIds.length === 0) return null
  if (!currentAssigneeId) return memberIds[0]
  const idx = memberIds.indexOf(currentAssigneeId)
  if (idx === -1) return memberIds[0]
  return memberIds[(idx + 1) % memberIds.length]
}

/**
 * Filter members to only active ones (with user_id set)
 */
export function filterActiveMembers<T extends { user_id: string | null }>(members: T[]): T[] {
  return members.filter(m => m.user_id != null)
}

/**
 * Extract week number from week string "YYYY-WXX" -> XX
 */
export function getWeekNumber(weekStr: string): number {
  return parseInt(weekStr.split('-W')[1])
}

/**
 * Get the Monday-Sunday date range for a week string, in Spanish
 */
export function getWeekDateRange(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekPart)

  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const mondayW1 = new Date(jan4)
  mondayW1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1)

  const monday = new Date(mondayW1)
  monday.setUTCDate(mondayW1.getUTCDate() + (week - 1) * 7)

  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const monDay = monday.getUTCDate()
  const sunDay = sunday.getUTCDate()
  const monMonth = months[monday.getUTCMonth()]
  const sunMonth = months[sunday.getUTCMonth()]

  return monMonth === sunMonth
    ? `${monDay}–${sunDay} ${monMonth}`
    : `${monDay} ${monMonth} – ${sunDay} ${sunMonth}`
}
