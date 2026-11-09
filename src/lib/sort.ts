export type EntrySortField = 'name' | 'modified' | 'created'
export type SortDirection = 'asc' | 'desc'

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
