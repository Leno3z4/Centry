'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { motion, MotionConfig, useDragControls } from 'motion/react'

export type WidgetSize = 'sm' | 'wide' | 'tall' | 'lg'

export interface WidgetItem {
  id: string
  size: WidgetSize
  label?: string
}

type Positioned = WidgetItem & { col: number; row: number; w: number; h: number }
type Rect = { left: number; top: number; right: number; bottom: number }
type Candidate = { order: WidgetItem[]; slot: Positioned; rect: Rect }

const SIZE_MAP: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 1, row: 1 },
  wide: { col: 2, row: 1 },
  tall: { col: 1, row: 2 },
  lg: { col: 2, row: 2 },
}

const LAYOUT_SPRING = { type: 'spring', visualDuration: 0.38, bounce: 0.16 } as const
const DRAG_SPRING = { type: 'spring', visualDuration: 0.26, bounce: 0.32 } as const
const DRAG_SCALE = 1.03
const TOUCH_HOLD_MS = 350
const TOUCH_MOVE_THRESHOLD = 8
const DRAG_FRAME_MS = 40
const LANDED_MS = 620

const overlap = (a: Positioned, b: Positioned) =>
  a.col < b.col + b.w &&
  b.col < a.col + a.w &&
  a.row < b.row + b.h &&
  b.row < a.row + a.h

const contains = (outer: Positioned, inner: Positioned) =>
  inner.col >= outer.col &&
  inner.row >= outer.row &&
  inner.col + inner.w <= outer.col + outer.w &&
  inner.row + inner.h <= outer.row + outer.h

const spanOf = (item: WidgetItem, columns: number) => ({
  w: Math.min(SIZE_MAP[item.size].col, columns),
  h: SIZE_MAP[item.size].row,
})

function tile(items: WidgetItem[], columns: number): Positioned[] | null {
  if (!items.length || columns < 1) return []

  const sizes = items.map((item) => spanOf(item, columns))
  const rows = Math.max(1, Math.ceil(sizes.reduce((sum, s) => sum + s.w * s.h, 0) / columns))
  const occupied = new Array(rows * columns).fill(false)
  const used = new Array(items.length).fill(false)
  const result = new Array<Positioned>(items.length)
  let budget = 20000

  const fits = (w: number, h: number, row: number, col: number) => {
    if (col + w > columns || row + h > rows) return false
    for (let r = row; r < row + h; r += 1) {
      for (let c = col; c < col + w; c += 1) {
        if (occupied[r * columns + c]) return false
      }
    }
    return true
  }

  const mark = (w: number, h: number, row: number, col: number, value: boolean) => {
    for (let r = row; r < row + h; r += 1) {
      for (let c = col; c < col + w; c += 1) occupied[r * columns + c] = value
    }
  }

  const place = (index: number): boolean => {
    if (index === items.length) return true
    if (--budget < 0) return false

    const firstFree = occupied.indexOf(false)
    if (firstFree < 0) return false

    const row = Math.floor(firstFree / columns)
    const col = firstFree % columns
    const tried = new Set<string>()

    for (let i = 0; i < items.length; i += 1) {
      if (used[i]) continue
      const { w, h } = sizes[i]
      const key = `${w}x${h}`
      if (tried.has(key) || !fits(w, h, row, col)) continue
      tried.add(key)
      used[i] = true
      mark(w, h, row, col, true)
      result[index] = { ...items[i], col, row, w, h }
      if (place(index + 1)) return true
      mark(w, h, row, col, false)
      used[i] = false
    }

    return false
  }

  return place(0) ? result : null
}

function pack(items: WidgetItem[], columns: number): Positioned[] {
  const result: Positioned[] = []
  let rowOffset = 0
  let remaining = items.map((item) => ({ ...item, ...spanOf(item, columns) }))

  while (remaining.length) {
    const blockHeight = Math.max(...remaining.slice(0, columns).map((item) => item.h))
    const occupied = new Array(blockHeight * columns).fill(false)
    const placed: Positioned[] = []
    const deferred: typeof remaining = []

    for (const item of remaining) {
      let index = -1
      for (let cursor = 0; cursor < occupied.length && index < 0; cursor += 1) {
        const row = Math.floor(cursor / columns)
        const col = cursor % columns
        if (col + item.w > columns || row + item.h > blockHeight) continue

        let free = true
        for (let r = row; r < row + item.h && free; r += 1) {
          for (let c = col; c < col + item.w; c += 1) {
            if (occupied[r * columns + c]) {
              free = false
              break
            }
          }
        }
        if (free) index = cursor
      }

      if (index < 0 || deferred.length) {
        deferred.push(item)
        continue
      }

      const row = Math.floor(index / columns)
      const col = index % columns
      for (let r = row; r < row + item.h; r += 1) {
        for (let c = col; c < col + item.w; c += 1) occupied[r * columns + c] = true
      }
      placed.push({ ...item, row, col })
    }

    for (let index = 0; index < occupied.length; index += 1) {
      if (occupied[index]) continue
      const row = Math.floor(index / columns)
      const col = index % columns
      const right = placed.find(
        (item) =>
          item.col + item.w === col &&
          item.row <= row &&
          item.row + item.h > row &&
          item.h === 1,
      )
      const below = placed.find(
        (item) =>
          item.row + item.h === row &&
          item.col === col &&
          item.w === 1,
      )
      const target = right ?? below
      if (!target) continue
      if (target === right) target.w += 1
      else target.h += 1
      occupied[index] = true
    }

    result.push(...placed.map((item) => ({ ...item, row: item.row + rowOffset })))
    rowOffset += blockHeight
    remaining = deferred
  }

  return result
}

function layout(items: WidgetItem[], columns: number) {
  return tile(items, columns) ?? pack(items, columns)
}

function sameOrder(a: WidgetItem[], b: WidgetItem[]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id)
}

function canonical(items: WidgetItem[], columns: number) {
  const current = layout(items, columns)
  if (current.length !== items.length) return items

  const byPosition = [...current].sort((a, b) => a.row - b.row || a.col - b.col)
  const byId = new Map(items.map((item) => [item.id, item]))
  const ordered = byPosition.map((item) => byId.get(item.id)).filter(Boolean) as WidgetItem[]
  if (ordered.every((item, index) => item === items[index])) return items

  const normalized = layout(ordered, columns)
  const normalizedById = new Map(normalized.map((item) => [item.id, item]))
  const stable = current.every((position) => {
    const next = normalizedById.get(position.id)
    return !!next &&
      next.col === position.col &&
      next.row === position.row &&
      next.w === position.w &&
      next.h === position.h
  })

  return stable ? ordered : items
}

function moveTo(items: WidgetItem[], id: string, index: number) {
  const from = items.findIndex((item) => item.id === id)
  if (from < 0 || from === index || index < 0 || index >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(index, 0, item)
  return next
}

function rectDistance(rect: Rect, x: number, y: number, inset = 0) {
  const width = (rect.right - rect.left) * inset
  const height = (rect.bottom - rect.top) * inset
  return Math.hypot(
    Math.max(rect.left + width - x, 0, x - (rect.right - width)),
    Math.max(rect.top + height - y, 0, y - (rect.bottom - height)),
  )
}

function centerDistance(rect: Rect, x: number, y: number) {
  return Math.hypot((rect.left + rect.right) / 2 - x, (rect.top + rect.bottom) / 2 - y)
}

function chooseCandidate(currentRect: Rect, candidates: Candidate[], x: number, y: number) {
  let bestDistance = rectDistance(currentRect, x, y)
  if (bestDistance === 0) return null

  let best: Candidate | null = null
  let bestCenter = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = rectDistance(candidate.rect, x, y, 0.18)
    const center = centerDistance(candidate.rect, x, y)
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && center < bestCenter)
    ) {
      bestDistance = distance
      bestCenter = center
      best = candidate
    }
  }

  return best
}

function candidatesFor(
  items: WidgetItem[],
  draggedId: string,
  columns: number,
  getRect: (slot: Positioned) => Rect,
): Candidate[] {
  const current = layout(items, columns)
  const dragged = current.find((item) => item.id === draggedId)
  if (!dragged) return []

  const byId = new Map(items.map((item) => [item.id, item]))
  const maxRows = Math.max(...current.map((item) => item.row + item.h))
  const candidates: Candidate[] = []

  for (let row = 0; row + dragged.h <= maxRows; row += 1) {
    for (let col = 0; col + dragged.w <= columns; col += 1) {
      const slot = { ...dragged, col, row }
      if (overlap(slot, dragged)) continue

      const impacted = current.filter((item) => overlap(item, slot))
      if (impacted.length < 2 || !impacted.every((item) => contains(slot, item))) continue

      const next = current.map((item) => {
        if (item.id === draggedId) return { ...item, col, row }
        if (!impacted.includes(item)) return item
        return {
          ...item,
          col: item.col - col + dragged.col,
          row: item.row - row + dragged.row,
        }
      })

      next.sort((a, b) => a.row - b.row || a.col - b.col)
      candidates.push({
        order: next.map((item) => byId.get(item.id)).filter(Boolean) as WidgetItem[],
        slot,
        rect: getRect(slot),
      })
    }
  }

  const currentIndex = items.findIndex((item) => item.id === draggedId)
  for (let index = 0; index < items.length; index += 1) {
    if (index === currentIndex) continue
    const order = moveTo(items, draggedId, index)
    const slot = layout(order, columns).find((item) => item.id === draggedId)
    if (slot) candidates.push({ order, slot, rect: getRect(slot) })
  }

  return candidates
}

type DragState = 'idle' | 'holding' | 'lifted'

function DraggableWidget({
  item,
  position,
  count,
  editable,
  col,
  row,
  w,
  h,
  held,
  raised,
  landed,
  hintId,
  renderItem,
  onDragStart,
  onDrag,
  onDragEnd,
  onKeyDown,
  onClickCapture,
  suppressClick,
}: {
  item: WidgetItem
  position: number
  count: number
  editable: boolean
  col: number
  row: number
  w: number
  h: number
  held: boolean
  raised: boolean
  landed: boolean
  hintId: string
  renderItem: (item: WidgetItem, size: { w: number; h: number }) => ReactNode
  onDragStart: (id: string) => void
  onDrag: () => void
  onDragEnd: () => void
  onKeyDown: (event: KeyboardEvent, id: string) => void
  onClickCapture: (event: MouseEvent<HTMLDivElement>) => void
  suppressClick: () => void
}) {
  const controls = useDragControls()
  const nodeRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const holdTimer = useRef<number | null>(null)
  const cleanupTouch = useRef<(() => void) | null>(null)
  const [dragState, setDragState] = useState<DragState>('idle')

  const clearTouch = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    cleanupTouch.current?.()
    cleanupTouch.current = null
    touchStart.current = null
    setDragState('idle')
  }, [])

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const blockTouchMove = (event: TouchEvent) => {
      if (dragState !== 'idle') event.preventDefault()
    }
    node.addEventListener('touchmove', blockTouchMove, { passive: false })
    return () => {
      node.removeEventListener('touchmove', blockTouchMove)
      clearTouch()
    }
  }, [clearTouch, dragState])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || event.button !== 0 || !event.isPrimary) return

    if (event.pointerType !== 'touch') {
      controls.start(event.nativeEvent)
      return
    }

    if (holdTimer.current !== null) return

    touchStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    setDragState('holding')

    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      if (!touchStart.current) return
      setDragState('lifted')
      suppressClick()

      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(10)
        } catch {}
      }

      controls.start(event.nativeEvent)

      const finish = (up: PointerEvent) => {
        if (up.pointerId !== touchStart.current?.pointerId) return
        suppressClick()
        clearTouch()
      }

      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      cleanupTouch.current = () => {
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
      }
    }, TOUCH_HOLD_MS)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = touchStart.current
    if (!start || holdTimer.current === null || event.pointerId !== start.pointerId) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_MOVE_THRESHOLD) {
      clearTouch()
    }
  }

  const handlePointerUp = () => {
    if (holdTimer.current !== null || touchStart.current) clearTouch()
  }

  return (
    <motion.div
      ref={nodeRef}
      role="listitem"
      data-slot="widget"
      data-widget-id={item.id}
      tabIndex={editable ? 0 : undefined}
      aria-label={item.label ?? `${item.size} widget`}
      aria-describedby={editable ? hintId : undefined}
      aria-posinset={position}
      aria-setsize={count}
      layout="position"
      drag={editable}
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragMomentum={false}
      onDragStart={() => onDragStart(item.id)}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearTouch}
      onContextMenu={(event) => {
        if (dragState !== 'idle') event.preventDefault()
      }}
      onKeyDown={(event) => onKeyDown(event, item.id)}
      onClickCapture={onClickCapture}
      animate={{
        scale: dragState === 'holding' ? 0.97 : dragState === 'lifted' ? DRAG_SCALE : 1,
        boxShadow:
          dragState === 'lifted'
            ? '0px 28px 60px -16px rgba(0,0,0,0.45), 0px 10px 24px -8px rgba(0,0,0,0.30)'
            : '0px 1px 2px 0px rgba(0,0,0,0.12)',
      }}
      whileDrag={{
        scale: DRAG_SCALE,
        boxShadow:
          '0px 28px 60px -16px rgba(0,0,0,0.45), 0px 10px 24px -8px rgba(0,0,0,0.30)',
        transition: DRAG_SPRING,
      }}
      transition={LAYOUT_SPRING}
      className={[
        'relative min-w-0 rounded-[var(--widget-radius)] outline-none',
        'focus-visible:ring-2 focus-visible:ring-white/50',
        '[&_a]:[-webkit-user-drag:none] [&_img]:[-webkit-user-drag:none]',
        editable
          ? 'cursor-grab touch-pan-y touch-pinch-zoom select-none [-webkit-touch-callout:none] active:cursor-grabbing'
          : '',
      ].join(' ')}
      style={{
        gridColumn: `${col + 1} / span ${w}`,
        gridRow: `${row + 1} / span ${h}`,
        zIndex: held ? 20 : raised ? 10 : 0,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          visualDuration: 0.6,
          bounce: 0.12,
          delay: (col / 4 + row / 8) * 0.26,
        }}
        className={[
          'relative isolate flex h-full w-full flex-col overflow-hidden',
          'rounded-[var(--widget-radius)] bg-card text-card-foreground',
          'ring-inset transition-shadow duration-300 [clip-path:inset(0_round_var(--widget-radius))]',
          landed ? 'ring-2 ring-white/30' : 'ring-1 ring-white/10',
        ].join(' ')}
      >
        {renderItem(item, { w, h })}
      </motion.div>
    </motion.div>
  )
}

export default function DraggableWidgetGrid({
  items,
  onChange,
  renderItem,
  editable = true,
  maxColumns = 4,
  cellSize = 215,
  gap = 12,
  radius = 24,
  className = '',
}: {
  items: WidgetItem[]
  onChange?: (items: WidgetItem[]) => void
  renderItem: (item: WidgetItem, size: { w: number; h: number }) => ReactNode
  editable?: boolean
  maxColumns?: number
  cellSize?: number
  gap?: number
  radius?: number
  className?: string
}) {
  const [orderedItems, setOrderedItems] = useState(items)
  const boardRef = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const [metrics, setMetrics] = useState({ unit: 0, columns: 0 })
  const [isPhone, setIsPhone] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [raisedId, setRaisedId] = useState<string | null>(null)
  const [landedId, setLandedId] = useState<string | null>(null)
  const current = useRef({
    items: orderedItems,
    metrics,
    onChange,
  })
  const snapshot = useRef<WidgetItem[] | null>(null)
  const frame = useRef<number | null>(null)
  const lastFrame = useRef(0)
  const landedTimer = useRef<number | null>(null)
  const suppressUntil = useRef(0)

  current.current.metrics = metrics
  current.current.onChange = onChange

  useEffect(() => {
    current.current.items = orderedItems
  }, [orderedItems])

  useEffect(() => {
    setOrderedItems((previous) => {
      const incoming = new Map(items.map((item) => [item.id, item]))
      const next: WidgetItem[] = []
      const seen = new Set<string>()

      for (const item of previous) {
        const updated = incoming.get(item.id)
        if (!updated || seen.has(item.id)) continue
        next.push(updated)
        seen.add(item.id)
      }

      for (const item of items) {
        if (!seen.has(item.id)) {
          next.push(item)
          seen.add(item.id)
        }
      }

      return sameOrder(previous, next) &&
        previous.every(
          (item, index) =>
            item.size === next[index].size &&
            item.label === next[index].label,
        )
        ? previous
        : next
    })
  }, [items])

  useEffect(() => {
    const phoneMedia = window.matchMedia('(max-width: 640px)')
    const syncPhone = () => setIsPhone(phoneMedia.matches)

    syncPhone()
    phoneMedia.addEventListener?.('change', syncPhone)
    return () => phoneMedia.removeEventListener?.('change', syncPhone)
  }, [])

  const canEdit = editable && !isPhone

  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    const measure = () => {
      const width = board.getBoundingClientRect().width
      if (width < 1) return

      const minColumns = isPhone ? 1 : Math.min(2, Math.max(1, maxColumns))
      const targetColumns = isPhone ? 1 : maxColumns
      const columns = Math.max(
        minColumns,
        Math.min(targetColumns, Math.round(width / Math.max(1, cellSize))),
      )
      const unit = (width - gap * (columns - 1)) / columns

      setMetrics((previous) =>
        previous.columns === columns && Math.abs(previous.unit - unit) < 0.5
          ? previous
          : { columns, unit },
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    return () => observer.disconnect()
  }, [cellSize, gap, isPhone, maxColumns])

  const columns = isPhone
    ? 1
    : metrics.columns || Math.max(1, Math.min(maxColumns, 4))

  const positions = useMemo(
    () => layout(orderedItems, columns),
    [orderedItems, columns],
  )

  const positionById = useMemo(
    () => new Map(positions.map((item) => [item.id, item])),
    [positions],
  )

  const orderPosition = useMemo(
    () =>
      new Map(
        [...positions]
          .sort((a, b) => a.row - b.row || a.col - b.col)
          .map((item, index) => [item.id, index]),
      ),
    [positions],
  )

  const applyOrder = useCallback((next: WidgetItem[]) => {
    current.current.items = next
    setOrderedItems(next)
  }, [])

  const getRect = useCallback(
    (slot: Positioned): Rect => {
      const board = boardRef.current
      const boardRect = board?.getBoundingClientRect()
      const unit = current.current.metrics.unit
      const step = unit + gap
      const left = (boardRect?.left ?? 0) + slot.col * step
      const top = (boardRect?.top ?? 0) + slot.row * step
      return {
        left,
        top,
        right: left + slot.w * step - gap,
        bottom: top + slot.h * step - gap,
      }
    },
    [gap],
  )

  const recompute = useCallback(
    (id: string | null) => {
      if (!id) return
      const { items: liveItems, metrics: liveMetrics } = current.current
      if (!liveMetrics.columns) return

      const widget = boardRef.current?.querySelector(
        `[data-widget-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null
      if (!widget) return

      const pointerRect = widget.getBoundingClientRect()
      const candidate = chooseCandidate(
        pointerRect,
        candidatesFor(liveItems, id, liveMetrics.columns, getRect),
        pointerRect.left + pointerRect.width / 2,
        pointerRect.top + pointerRect.height / 2,
      )

      if (candidate) {
        applyOrder(canonical(candidate.order, liveMetrics.columns))
      }
    },
    [applyOrder, getRect],
  )

  const schedule = useCallback(
    (id: string) => {
      if (frame.current !== null) return

      frame.current = requestAnimationFrame(() => {
        frame.current = null
        const now = performance.now()

        if (now - lastFrame.current < DRAG_FRAME_MS) {
          schedule(id)
          return
        }

        lastFrame.current = now
        recompute(id)
      })
    },
    [recompute],
  )

  const onStart = useCallback((id: string) => {
    snapshot.current = current.current.items
    lastFrame.current = 0
    setDraggedId(id)
    setRaisedId(id)

    window.addEventListener(
      'pointerup',
      () => {
        suppressUntil.current = performance.now() + 300
      },
      { once: true, capture: true },
    )
  }, [])

  const onEnd = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null

    const id = draggedId
    recompute(id)

    const before = snapshot.current
    const after = current.current.items

    setDraggedId(null)
    setRaisedId(id)
    setLandedId(id)

    if (landedTimer.current !== null) window.clearTimeout(landedTimer.current)
    landedTimer.current = window.setTimeout(() => {
      setRaisedId(null)
      setLandedId(null)
    }, LANDED_MS)

    snapshot.current = null

    if (before && !sameOrder(before, after)) current.current.onChange?.(after)
  }, [draggedId, recompute])

  const onKeyDown = useCallback(
    (event: KeyboardEvent, id: string) => {
      if (
        !editable ||
        !event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }

      const delta =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0

      if (!delta) return
      event.preventDefault()

      const itemsNow = current.current.items
      const index = itemsNow.findIndex((item) => item.id === id)
      if (index < 0) return

      for (
        let target = index + delta;
        target >= 0 && target < itemsNow.length;
        target += delta
      ) {
        const next = canonical(
          moveTo(itemsNow, id, target),
          current.current.metrics.columns || maxColumns,
        )

        if (!sameOrder(next, itemsNow)) {
          applyOrder(next)
          current.current.onChange?.(next)

          requestAnimationFrame(() => {
            const node = boardRef.current?.querySelector(
              `[data-widget-id="${CSS.escape(id)}"]`,
            ) as HTMLElement | null
            node?.focus()
          })
          return
        }
      }
    },
    [applyOrder, editable, maxColumns],
  )

  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressUntil.current) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (
        editable &&
        event.target instanceof Element &&
        event.target.closest('a')
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    [editable],
  )

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      if (landedTimer.current !== null) window.clearTimeout(landedTimer.current)
    },
    [],
  )

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={boardRef}
        className={`relative w-full ${className}`}
        style={{ ['--widget-radius' as string]: `${radius}px` }}
      >
        {editable && (
          <p id={hintId} className="sr-only">
            {isPhone
              ? 'Cards are arranged automatically on phones.'
              : 'Drag to rearrange. On touch screens, press and hold first. With a keyboard, hold Alt and use the arrow keys.'}
          </p>
        )}

        <div
          role="list"
          data-slot="widget-grid"
          className="grid w-full"
          style={{
            gap,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoRows: metrics.unit
              ? `${Math.round(metrics.unit)}px`
              : `${Math.round(cellSize)}px`,
          }}
        >
          {orderedItems.map((item) => {
            const position = positionById.get(item.id)
            if (!position) return null

            return (
              <DraggableWidget
                key={item.id}
                item={item}
                position={(orderPosition.get(item.id) ?? 0) + 1}
                count={orderedItems.length}
                editable={canEdit}
                col={position.col}
                row={position.row}
                w={position.w}
                h={position.h}
                held={draggedId === item.id}
                raised={raisedId === item.id}
                landed={landedId === item.id}
                hintId={hintId}
                renderItem={renderItem}
                onDragStart={onStart}
                onDrag={() => schedule(item.id)}
                onDragEnd={onEnd}
                onKeyDown={onKeyDown}
                onClickCapture={onClickCapture}
                suppressClick={() => {
                  suppressUntil.current = performance.now() + 300
                }}
              />
            )
          })}
        </div>
      </div>
    </MotionConfig>
  )
}
