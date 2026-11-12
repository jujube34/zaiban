export type EntrySortField = 'name' | 'modified' | 'created'
export type SortDirection = 'asc' | 'desc'

export interface EntrySortPreference {
  field: EntrySortField
  direction: SortDirection
}

export const DEFAULT_ENTRY_SORT: EntrySortPreference = { field: 'modified', direction: 'desc' }

const SORT_PREFERENCE_KEY = 'prjm.entrySort'

function isSortField(value: unknown): value is EntrySortField {
  return value === 'name' || value === 'modified' || value === 'created'
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc'
}

export function defaultDirectionFor(field: EntrySortField): SortDirection {
  return field === 'name' ? 'asc' : 'desc'
}

export function loadSortPreference(): EntrySortPreference {
  if (typeof window === 'undefined') return DEFAULT_ENTRY_SORT
  try {
    const raw = window.localStorage.getItem(SORT_PREFERENCE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { field?: unknown; direction?: unknown }
      if (isSortField(parsed.field) && isSortDirection(parsed.direction)) {
        return { field: parsed.field, direction: parsed.direction }
      }
    }
  } catch {
    // Local storage is optional; fall back to the default order.
  }
  return DEFAULT_ENTRY_SORT
}

export function saveSortPreference(preference: EntrySortPreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SORT_PREFERENCE_KEY, JSON.stringify(preference))
  } catch {
    // Local storage is optional.
  }
}

export interface SortableEntry {
  name: string
  lastModified?: number
  createdAt?: number
}

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function compareNames(left: string, right: string): number {
  return collator.compare(left, right)
}

export function compareSortableEntries(
  left: SortableEntry,
  right: SortableEntry,
  field: EntrySortField,
  direction: SortDirection,
): number {
  if (field === 'name') {
    const comparison = compareNames(left.name, right.name)
    return direction === 'asc' ? comparison : -comparison
  }

  const leftTime = field === 'modified' ? left.lastModified : left.createdAt
  const rightTime = field === 'modified' ? right.lastModified : right.createdAt

  // Entries without a usable timestamp stay at the end of the list.
  if (leftTime === undefined && rightTime === undefined) return compareNames(left.name, right.name)
  if (leftTime === undefined) return 1
  if (rightTime === undefined) return -1
  if (leftTime === rightTime) return compareNames(left.name, right.name)
  return direction === 'asc' ? leftTime - rightTime : rightTime - leftTime
}
