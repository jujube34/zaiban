import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import type { EntrySortField, SortDirection } from '../lib/sort'

interface SortControlProps {
  field: EntrySortField
  direction: SortDirection
  onFieldChange: (field: EntrySortField) => void
  onDirectionToggle: () => void
}

const SORT_OPTIONS: Array<{ value: EntrySortField; label: string }> = [
  { value: 'name', label: '名称' },
  { value: 'modified', label: '修改时间' },
  { value: 'created', label: '创建时间' },
]

export function SortControl({
  field,
  direction,
  onFieldChange,
  onDirectionToggle,
}: SortControlProps) {
  const descending = direction === 'desc'
  const directionLabel = descending ? '降序' : '升序'
  const nextDirectionLabel = descending ? '升序' : '降序'

  return (
    <div className="entry-sort">
      <span className="entry-sort__label">排序</span>
      <span className="entry-sort__select-wrap">
        <select
          className="entry-sort__select"
          value={field}
          onChange={(event) => onFieldChange(event.target.value as EntrySortField)}
          aria-label="排序方式"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="entry-sort__chevron" size={14} strokeWidth={1.8} />
      </span>
      <button
        type="button"
        className="entry-sort__direction"
        onClick={onDirectionToggle}
        title={`当前${directionLabel}，点击切换为${nextDirectionLabel}`}
        aria-label={`当前${directionLabel}，切换为${nextDirectionLabel}`}
      >
        {descending ? (
          <ArrowDown size={15} strokeWidth={1.8} />
        ) : (
          <ArrowUp size={15} strokeWidth={1.8} />
        )}
      </button>
    </div>
  )
}
