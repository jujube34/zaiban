import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Check,
  ChevronRight,
  Folder,
  Loader2,
  RotateCw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { ProjectCandidate } from '../types'
import { relativeTime } from '../lib/format'
import {
  friendlyFsError,
  scanFolderLevel,
  searchProjectFolders,
} from '../lib/fs'
import { compactFolderPath, parentPath } from '../lib/paths'
import { Modal } from './Modal'

interface AddProjectsModalProps {
  root: FileSystemDirectoryHandle
  trackedFolders: string[]
  onClose: () => void
  onAdd: (candidates: ProjectCandidate[]) => Promise<boolean>
}

interface TreeNode {
  candidate: ProjectCandidate
  expanded: boolean
  loading: boolean
  children: string[] | null
  loadError?: string
}

type ScanState = 'loading' | 'ready' | 'error'
type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SearchState {
  status: SearchStatus
  items: ProjectCandidate[]
  truncated: boolean
  error?: string
}

export function AddProjectsModal({ root, trackedFolders, onClose, onAdd }: AddProjectsModalProps) {
  const [scanState, setScanState] = useState<ScanState>('loading')
  const [scanError, setScanError] = useState('')
  const [roots, setRoots] = useState<string[]>([])
  const [nodes, setNodes] = useState<Map<string, TreeNode>>(() => new Map())
  const [selected, setSelected] = useState<Map<string, ProjectCandidate>>(() => new Map())
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({
    status: 'idle',
    items: [],
    truncated: false,
  })
  const [searchNonce, setSearchNonce] = useState(0)
  const [adding, setAdding] = useState(false)
  const treeRequest = useRef(0)
  const trackedSet = useMemo(() => new Set(trackedFolders), [trackedFolders])
  const searchActive = query.trim().length > 0

  const patchNode = useCallback((path: string, patch: Partial<TreeNode>) => {
    setNodes((current) => {
      const node = current.get(path)
      if (!node) return current
      const next = new Map(current)
      next.set(path, { ...node, ...patch })
      return next
    })
  }, [])

  const loadTree = useCallback(async () => {
    const request = ++treeRequest.current
    setScanState('loading')
    setScanError('')
    try {
      const candidates = await scanFolderLevel(root)
      if (treeRequest.current !== request) return
      const next = new Map<string, TreeNode>()
      for (const candidate of candidates) {
        next.set(candidate.folder, {
          candidate,
          expanded: false,
          loading: false,
          children: null,
        })
      }
      setNodes(next)
      setRoots(candidates.map((candidate) => candidate.folder))
      setScanState('ready')
    } catch (caught) {
      if (treeRequest.current !== request) return
      setScanError(friendlyFsError(caught))
      setScanState('error')
    }
  }, [root])

  useEffect(() => {
    void loadTree()
    return () => {
      treeRequest.current += 1
    }
  }, [loadTree])

  useEffect(() => {
    const normalized = query.trim()
    if (!normalized) {
      setSearchState({ status: 'idle', items: [], truncated: false })
      return
    }

    const controller = new AbortController()
    setSearchState({ status: 'loading', items: [], truncated: false })
    const timer = window.setTimeout(() => {
      void searchProjectFolders(root, normalized, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          setSearchState({
            status: 'ready',
            items: result.items,
            truncated: result.truncated,
          })
        })
        .catch((caught) => {
          if (controller.signal.aborted) return
          if (caught instanceof DOMException && caught.name === 'AbortError') return
          setSearchState({
            status: 'error',
            items: [],
            truncated: false,
            error: friendlyFsError(caught),
          })
        })
    }, 260)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, root, searchNonce])

  const loadChildren = useCallback(
    async (node: TreeNode) => {
      const request = treeRequest.current
      patchNode(node.candidate.folder, { loading: true, loadError: undefined })
      try {
        const children = await scanFolderLevel(node.candidate.handle, node.candidate.folder)
        if (treeRequest.current !== request) return
        setNodes((current) => {
          const next = new Map(current)
          for (const child of children) {
            if (!next.has(child.folder)) {
              next.set(child.folder, {
                candidate: child,
                expanded: false,
                loading: false,
                children: null,
              })
            }
          }
          const parent = next.get(node.candidate.folder)
          if (parent) {
            next.set(node.candidate.folder, {
              ...parent,
              children: children.map((child) => child.folder),
              loading: false,
              loadError: undefined,
            })
          }
          return next
        })
      } catch (caught) {
        if (treeRequest.current !== request) return
        patchNode(node.candidate.folder, {
          loading: false,
          loadError: friendlyFsError(caught),
        })
      }
    },
    [patchNode],
  )

  const toggleExpand = (path: string) => {
    const node = nodes.get(path)
    if (!node || node.loading) return
    if (node.expanded) {
      patchNode(path, { expanded: false })
      return
    }
    patchNode(path, { expanded: true })
    if (node.children === null) void loadChildren(node)
  }

  const toggleSelection = (candidate: ProjectCandidate) => {
    if (trackedSet.has(candidate.folder) || candidate.error) return
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(candidate.folder)) next.delete(candidate.folder)
      else next.set(candidate.folder, candidate)
      return next
    })
  }

  const addSelected = async () => {
    if (adding) return
    const chosen = Array.from(selected.values())
    if (chosen.length === 0) return
    setAdding(true)
    try {
      const success = await onAdd(chosen)
      if (success) onClose()
    } finally {
      setAdding(false)
    }
  }

  const renderTree = (path: string, depth: number): ReactNode => {
    const node = nodes.get(path)
    if (!node) return null
    const canExpand = node.loading || node.children === null || node.children.length > 0
    return (
      <Fragment key={path}>
        <FolderChoice
          candidate={node.candidate}
          depth={Math.min(depth, 10)}
          selected={selected.has(node.candidate.folder)}
          tracked={trackedSet.has(node.candidate.folder)}
          expandable={canExpand}
          expanded={node.expanded}
          loading={node.loading}
          onToggleExpand={() => toggleExpand(path)}
          onToggleSelect={() => toggleSelection(node.candidate)}
        />
        {node.expanded && node.loading && (
          <div
            className="folder-tree__note"
            style={{ '--folder-depth': Math.min(depth, 10) } as CSSProperties}
          >
            <Loader2 size={13} className="spin" />
            正在读取子文件夹…
          </div>
        )}
        {node.expanded && node.loadError && (
          <div
            className="folder-tree__note folder-tree__note--error"
            style={{ '--folder-depth': Math.min(depth, 10) } as CSSProperties}
          >
            <TriangleAlert size={13} />
            <span>{node.loadError}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => void loadChildren(node)}
            >
              重试
            </button>
          </div>
        )}
        {node.expanded &&
          node.children?.map((childPath) => renderTree(childPath, depth + 1))}
        {node.expanded && node.children?.length === 0 && (
          <div
            className="folder-tree__note"
            style={{ '--folder-depth': Math.min(depth, 10) } as CSSProperties}
          >
            这个文件夹里没有子文件夹
          </div>
        )}
      </Fragment>
    )
  }

  return (
    <Modal
      title="添加项目"
      eyebrow={`工作目录 · ${root.name}`}
      onClose={onClose}
      className="add-projects"
      footer={
        <>
          <span className="modal__selection">
            已选择 <strong>{selected.size}</strong> 个项目
          </span>
          <div className="modal__footer-actions">
            <button type="button" className="button button--ghost" onClick={onClose} disabled={adding}>
              取消
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={addSelected}
              disabled={selected.size === 0 || adding}
            >
              {adding ? <Loader2 size={17} className="spin" /> : null}
              {adding ? '正在添加…' : `添加${selected.size > 0 ? ` ${selected.size} 个` : ''}`}
            </button>
          </div>
        </>
      }
    >
      <p className="modal__intro">
        点击左侧箭头展开任意层级，勾选要跟踪的文件夹。也可以直接搜索所有层级。
      </p>

      <div className="candidate-toolbar">
        <label className="search-field search-field--compact">
          <Search size={16} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索所有层级的文件夹"
            aria-label="搜索所有层级的文件夹"
          />
          {searchActive && (
            <button
              type="button"
              className="search-field__clear"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      <div className="candidate-list folder-tree">
        {!searchActive && scanState === 'loading' && (
          <div className="candidate-loading">
            {[0, 1, 2, 3].map((item) => (
              <div className="candidate-skeleton" key={item}>
                <span className="skeleton skeleton--icon" />
                <span className="candidate-skeleton__text">
                  <span className="skeleton skeleton--line" />
                  <span className="skeleton skeleton--short" />
                </span>
              </div>
            ))}
          </div>
        )}

        {!searchActive && scanState === 'error' && (
          <div className="inline-state">
            <TriangleAlert size={22} strokeWidth={1.7} />
            <strong>无法读取项目列表</strong>
            <p>{scanError}</p>
            <button type="button" className="button button--ghost button--compact" onClick={loadTree}>
              <RotateCw size={15} />
              重试
            </button>
          </div>
        )}

        {!searchActive && scanState === 'ready' && roots.length === 0 && (
          <div className="inline-state">
            <Folder size={24} strokeWidth={1.5} />
            <strong>这个工作目录里还没有子文件夹</strong>
            <p>把正在进行的项目文件夹放进工作目录，再重新打开这个窗口。</p>
          </div>
        )}

        {!searchActive &&
          scanState === 'ready' &&
          roots.map((path) => renderTree(path, 0))}

        {searchActive && searchState.status === 'loading' && (
          <div className="inline-state">
            <Loader2 size={22} className="spin" />
            <strong>正在搜索所有层级…</strong>
            <p>递归查找匹配的文件夹，深层目录也会出现在结果中。</p>
          </div>
        )}

        {searchActive && searchState.status === 'error' && (
          <div className="inline-state">
            <TriangleAlert size={22} strokeWidth={1.7} />
            <strong>搜索没有完成</strong>
            <p>{searchState.error}</p>
            <button
              type="button"
              className="button button--ghost button--compact"
              onClick={() => setSearchNonce((value) => value + 1)}
            >
              <RotateCw size={15} />
              重新搜索
            </button>
          </div>
        )}

        {searchActive && searchState.status === 'ready' && searchState.items.length === 0 && (
          <div className="inline-state inline-state--small">
            <strong>没有找到「{query.trim()}」</strong>
            <p>文件夹层级不限，但隐藏目录和 node_modules 不会出现在列表中。</p>
          </div>
        )}

        {searchActive &&
          searchState.status === 'ready' &&
          searchState.items.map((candidate) => (
            <FolderChoice
              key={candidate.folder}
              candidate={candidate}
              depth={0}
              selected={selected.has(candidate.folder)}
              tracked={trackedSet.has(candidate.folder)}
              expandable={false}
              onToggleExpand={() => undefined}
              onToggleSelect={() => toggleSelection(candidate)}
            />
          ))}

        {searchActive && searchState.status === 'ready' && searchState.truncated && (
          <div className="folder-tree__limit">
            目录数量较多，搜索只覆盖了部分内容。输入更具体的关键词可以缩小范围。
          </div>
        )}
      </div>
    </Modal>
  )
}

interface FolderChoiceProps {
  candidate: ProjectCandidate
  depth: number
  selected: boolean
  tracked: boolean
  expandable: boolean
  expanded?: boolean
  loading?: boolean
  onToggleExpand: () => void
  onToggleSelect: () => void
}

function FolderChoice({
  candidate,
  depth,
  selected,
  tracked,
  expandable,
  expanded = false,
  loading = false,
  onToggleExpand,
  onToggleSelect,
}: FolderChoiceProps) {
  const context = parentPath(candidate.folder)
  const noteCount = candidate.existing?.notes.length ?? 0
  const status = candidate.error
    ? null
    : tracked
      ? '已跟踪'
      : candidate.existing
        ? `${noteCount > 0 ? `已有 ${noteCount} 条笔记` : '已有项目记录'}${
            candidate.existing.updatedAt ? ` · ${relativeTime(candidate.existing.updatedAt)}` : ''
          }`
        : '新项目 · 尚无记录'

  return (
    <div
      className={`folder-choice ${selected ? 'is-selected' : ''} ${
        tracked ? 'is-tracked' : ''
      } ${candidate.error ? 'is-disabled' : ''}`}
      style={{ '--folder-depth': depth } as CSSProperties}
    >
      {expandable ? (
        <button
          type="button"
          className={`folder-choice__expander ${expanded ? 'is-expanded' : ''}`}
          onClick={onToggleExpand}
          aria-label={`${expanded ? '收起' : '展开'} ${candidate.name} 的子文件夹`}
          aria-expanded={expanded}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <ChevronRight size={15} strokeWidth={1.9} />
          )}
        </button>
      ) : (
        <span className="folder-choice__expander-spacer" />
      )}

      <button
        type="button"
        className="folder-choice__select"
        role="checkbox"
        aria-checked={selected || tracked}
        disabled={tracked || Boolean(candidate.error)}
        onClick={onToggleSelect}
      >
        <span className="folder-choice__check" aria-hidden="true">
          {(selected || tracked) && <Check size={12} strokeWidth={2.6} />}
        </span>
        <span className="folder-choice__folder" aria-hidden="true">
          <Folder size={17} strokeWidth={1.6} />
        </span>
        <span className="folder-choice__body">
          <strong>{candidate.name}</strong>
          <span className={`folder-choice__meta ${candidate.error ? 'is-error' : ''}`}>
            {context && (
              <>
                <span className="folder-choice__path" title={candidate.folder}>
                  {compactFolderPath(context)}
                </span>
                <span className="folder-choice__dot" />
              </>
            )}
            {candidate.error ? (
              <>
                <TriangleAlert size={11} />
                记录文件无法读取
              </>
            ) : (
              status
            )}
          </span>
        </span>
      </button>
    </div>
  )
}
