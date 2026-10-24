import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, CalendarClock, Check, ChevronRight, Columns3, Copy,
  Eye, GripVertical, Heading2, Image, Laptop, Link2, Mail, Minus, Monitor, MousePointerClick,
  PanelRightClose, PanelRightOpen, Plus, Redo2, Save, Send, Smartphone, Space, Trash2, Type, Undo2, Users, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAdminData } from '../../../admin/AdminContext'
import { ConfirmDialog, Field, SearchField } from '../../../admin/components'
import { useUnsavedChanges } from '../../../admin/utils'
import {
  queueEmailCampaign, saveEmailCampaign, sendEmailCampaignTest, uploadEmailCampaignImage,
} from '../../../lib/data'
import type {
  EmailCampaign, EmailCampaignAudience, EmailCampaignBlock, EmailCampaignBlockType, EmailCampaignDraft,
  EmailCampaignPurpose, EmailCampaignWorkspace,
} from '../../../types'
import {
  BLOCK_COLOURS, campaignTemplates, createBlock, duplicateBlock, findBlock, findLocation, insertBlock, mapBlock,
  moveBlock, normaliseBlocks, removeBlock, validateCampaignDraft,
} from './editorModel'
import './studio.css'

type Stage = 'design' | 'audience' | 'review'
type Viewport = 'desktop' | 'mobile'
type History = { past: EmailCampaignDraft[]; present: EmailCampaignDraft; future: EmailCampaignDraft[] }

const blockMeta: Record<EmailCampaignBlockType, { label: string; icon: typeof Type }> = {
  heading: { label: 'Heading', icon: Heading2 }, paragraph: { label: 'Paragraph', icon: Type },
  image: { label: 'Image', icon: Image }, button: { label: 'Button', icon: MousePointerClick },
  link: { label: 'Text link', icon: Link2 }, divider: { label: 'Divider', icon: Minus },
  spacer: { label: 'Spacer', icon: Space }, columns: { label: 'Columns', icon: Columns3 },
}

function paletteId(type: EmailCampaignBlockType) { return `palette:${type}` }
function containerId(parentId: string | null, columnIndex: number | null) { return parentId ? `container:${parentId}:${columnIndex}` : 'container:root' }
function parseContainer(value: string) {
  if (value === 'container:root') return { parentId: null, columnIndex: null }
  const [, parentId, index] = value.split(':')
  return { parentId, columnIndex: Number(index) }
}
function stripRevision(draft: EmailCampaignDraft) { const { revision: _revision, ...rest } = draft; return JSON.stringify(rest) }
function campaignToDraft(campaign: EmailCampaign): EmailCampaignDraft {
  return { id: campaign.id, revision: campaign.revision, name: campaign.name, subject: campaign.subject, previewText: campaign.previewText, blocks: normaliseBlocks(campaign.blocks), purpose: campaign.purpose, audience: campaign.audience, recipientEmails: campaign.recipientEmails }
}

function PaletteItem({ type, onAdd }: { type: EmailCampaignBlockType; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: paletteId(type), data: { kind: 'palette', type } })
  const Icon = blockMeta[type].icon
  return <button ref={setNodeRef} className={`campaign-palette-item${isDragging ? ' dragging' : ''}`} onClick={onAdd} {...listeners} {...attributes}><Icon /><span>{blockMeta[type].label}</span><GripVertical /></button>
}

function blockStyles(block: EmailCampaignBlock): CSSProperties {
  return {
    background: block.backgroundColor, color: block.textColor, textAlign: block.align,
    padding: block.type === 'spacer' ? 0 : block.padding, border: `${block.borderWidth ?? 0}px solid ${block.borderColor}`,
    borderRadius: block.borderRadius, fontFamily: block.fontFamily === 'sans' ? 'DM Sans, sans-serif' : 'Libre Baskerville, serif',
    fontSize: block.fontSize, fontWeight: block.fontWeight, lineHeight: block.lineHeight,
  }
}

function CanvasLeaf({ block, selected, onSelect, onUpdate, onDelete, onDuplicate }: {
  block: EmailCampaignBlock; selected: boolean; onSelect: () => void; onUpdate: (values: Partial<EmailCampaignBlock>) => void; onDelete: () => void; onDuplicate: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, data: { kind: 'block' } })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const editable = (tag: 'h2' | 'p', className: string) => {
    const Tag = tag
    return <Tag className={className} style={blockStyles(block)} contentEditable suppressContentEditableWarning spellCheck onClick={(event) => { event.stopPropagation(); onSelect() }} onBlur={(event) => onUpdate({ text: event.currentTarget.textContent ?? '' })}>{block.text}</Tag>
  }
  let content: ReactNode
  if (block.type === 'heading') content = editable('h2', 'campaign-canvas-heading')
  else if (block.type === 'paragraph') content = editable('p', 'campaign-canvas-paragraph')
  else if (block.type === 'image') content = <figure style={blockStyles(block)}>{block.url ? <img src={block.url} alt={block.alt} style={{ width: `${block.width ?? 100}%`, borderRadius: block.borderRadius }} /> : <div className="campaign-image-placeholder"><Image /><strong>Choose an image</strong><small>Use the inspector to upload or paste a URL</small></div>}{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
  else if (block.type === 'button') content = <div style={{ textAlign: block.align, padding: block.padding }}><span className="campaign-canvas-button" style={blockStyles(block)} contentEditable suppressContentEditableWarning onBlur={(event) => onUpdate({ text: event.currentTarget.textContent ?? '' })}>{block.text}</span></div>
  else if (block.type === 'link') content = <p style={{ textAlign: block.align, padding: block.padding }}><span className="campaign-canvas-link" style={{ color: block.textColor, fontSize: block.fontSize }} contentEditable suppressContentEditableWarning onBlur={(event) => onUpdate({ text: event.currentTarget.textContent ?? '' })}>{block.text}</span></p>
  else if (block.type === 'divider') content = <hr style={{ border: 0, borderTop: `${Math.max(1, block.borderWidth ?? 1)}px solid ${block.backgroundColor}`, margin: `${block.padding}px 0` }} />
  else content = <div className="campaign-canvas-spacer" style={{ height: block.padding }}><span>{block.padding}px space</span></div>
  return <div ref={setNodeRef} style={style} className={`campaign-canvas-block${selected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`} onClick={onSelect}>
    <div className="campaign-block-tools"><button aria-label={`Drag ${blockMeta[block.type].label}`} {...listeners} {...attributes}><GripVertical /></button><button aria-label="Duplicate block" onClick={(event) => { event.stopPropagation(); onDuplicate() }}><Copy /></button><button aria-label="Delete block" onClick={(event) => { event.stopPropagation(); onDelete() }}><Trash2 /></button></div>
    {content}
  </div>
}

function DropColumn({ parentId, columnIndex, blocks, selectedId, onSelect, onUpdate, onDelete, onDuplicate }: {
  parentId: string | null; columnIndex: number | null; blocks: EmailCampaignBlock[]; selectedId: string; onSelect: (id: string) => void; onUpdate: (id: string, values: Partial<EmailCampaignBlock>) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void
}) {
  const id = containerId(parentId, columnIndex)
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind: 'container', parentId, columnIndex } })
  return <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}><div ref={setNodeRef} className={`campaign-drop-column${isOver ? ' is-over' : ''}${!blocks.length ? ' empty' : ''}`}>{blocks.map((block) => block.type === 'columns' ? <CanvasColumns key={block.id} block={block} selectedId={selectedId} onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} /> : <CanvasLeaf key={block.id} block={block} selected={selectedId === block.id} onSelect={() => onSelect(block.id)} onUpdate={(values) => onUpdate(block.id, values)} onDelete={() => onDelete(block.id)} onDuplicate={() => onDuplicate(block.id)} />)}{!blocks.length && <div className="campaign-empty-drop"><Plus /><span>Drop content here</span></div>}</div></SortableContext>
}

function CanvasColumns({ block, selectedId, onSelect, onUpdate, onDelete, onDuplicate }: {
  block: EmailCampaignBlock; selectedId: string; onSelect: (id: string) => void; onUpdate: (id: string, values: Partial<EmailCampaignBlock>) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, data: { kind: 'block' } })
  return <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, ...blockStyles(block) }} className={`campaign-canvas-block campaign-columns-block${selectedId === block.id ? ' selected' : ''}${isDragging ? ' dragging' : ''}`} onClick={() => onSelect(block.id)}>
    <div className="campaign-block-tools"><button aria-label="Drag columns" {...listeners} {...attributes}><GripVertical /></button><button aria-label="Duplicate columns" onClick={(event) => { event.stopPropagation(); onDuplicate(block.id) }}><Copy /></button><button aria-label="Delete columns" onClick={(event) => { event.stopPropagation(); onDelete(block.id) }}><Trash2 /></button></div>
    <div className="campaign-columns-grid">{(block.columns ?? [[], []]).map((column, index) => <DropColumn key={index} parentId={block.id} columnIndex={index} blocks={column} selectedId={selectedId} onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} />)}</div>
  </section>
}

function PropertiesInspector({ block, working, onUpdate, onUpload, onDuplicate, onDelete, onClose }: {
  block?: EmailCampaignBlock; working: string; onUpdate: (values: Partial<EmailCampaignBlock>) => void; onUpload: (file: File) => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void
}) {
  if (!block) return <aside className="campaign-inspector"><div className="campaign-panel-heading"><div><small>Inspector</small><strong>Nothing selected</strong></div><button aria-label="Close inspector" onClick={onClose}><PanelRightClose /></button></div><div className="campaign-inspector-empty"><MousePointerClick /><h3>Select something</h3><p>Choose a block on the canvas to edit its content and appearance.</p></div></aside>
  const isText = ['heading', 'paragraph', 'button', 'link'].includes(block.type)
  return <aside className="campaign-inspector"><div className="campaign-panel-heading"><div><small>Inspector</small><strong>{blockMeta[block.type].label}</strong></div><button aria-label="Close inspector" onClick={onClose}><PanelRightClose /></button></div><div className="campaign-inspector-scroll">
    {isText && <Field label={block.type === 'paragraph' ? 'Text' : 'Label'} wide>{block.type === 'paragraph' ? <textarea rows={6} value={block.text} onChange={(event) => onUpdate({ text: event.target.value })} /> : <input value={block.text} onChange={(event) => onUpdate({ text: event.target.value })} />}</Field>}
    {['button', 'link', 'image'].includes(block.type) && <Field label={block.type === 'image' ? 'Image URL' : 'Destination'} hint="Secure https:// links only" wide><input type="url" value={block.url} onChange={(event) => onUpdate({ url: event.target.value })} /></Field>}
    {block.type === 'image' && <><label className="campaign-upload-control"><Image /><span><strong>{working === 'image' ? 'Uploading…' : 'Replace image'}</strong><small>JPG, PNG or WebP · max 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={working === 'image'} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = '' }} /></label><Field label="Image description" wide><input value={block.alt} onChange={(event) => onUpdate({ alt: event.target.value })} /></Field><Field label="Caption" wide><input value={block.caption} onChange={(event) => onUpdate({ caption: event.target.value })} /></Field><Field label={`Image width · ${block.width ?? 100}%`} wide><input type="range" min="20" max="100" step="5" value={block.width ?? 100} onChange={(event) => onUpdate({ width: Number(event.target.value) })} /></Field></>}
    {block.type === 'columns' && <Field label="Columns" wide><div className="campaign-segmented">{[2, 3].map((count) => <button key={count} className={(block.columns?.length ?? 2) === count ? 'active' : ''} onClick={() => onUpdate({ columns: Array.from({ length: count }, (_, index) => block.columns?.[index] ?? [createBlock('paragraph')]) })}>{count} columns</button>)}</div></Field>}
    {block.type !== 'columns' && block.type !== 'divider' && block.type !== 'spacer' && <Field label="Alignment" wide><div className="campaign-segmented icon-only">{([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([align, Icon]) => <button key={align} className={block.align === align ? 'active' : ''} aria-label={`Align ${align}`} onClick={() => onUpdate({ align })}><Icon /></button>)}</div></Field>}
    <div className="campaign-style-grid"><Field label="Background"><input type="color" value={block.backgroundColor ?? '#fffaf0'} onChange={(event) => onUpdate({ backgroundColor: event.target.value })} /></Field>{block.type !== 'image' && block.type !== 'divider' && block.type !== 'spacer' && <Field label="Text colour"><input type="color" value={block.textColor ?? '#2d1c15'} onChange={(event) => onUpdate({ textColor: event.target.value })} /></Field>}</div>
    <div className="campaign-colour-swatches" aria-label="Doxa colour palette">{BLOCK_COLOURS.map((colour) => <button key={colour} title={colour} aria-label={`Use ${colour} background`} style={{ background: colour }} onClick={() => onUpdate({ backgroundColor: colour })} />)}</div>
    {isText && <><div className="campaign-style-grid"><Field label="Typeface"><select value={block.fontFamily ?? 'serif'} onChange={(event) => onUpdate({ fontFamily: event.target.value as 'serif' | 'sans' })}><option value="serif">Editorial serif</option><option value="sans">Clean sans serif</option></select></Field><Field label="Weight"><select value={block.fontWeight ?? 'normal'} onChange={(event) => onUpdate({ fontWeight: event.target.value as 'normal' | 'bold' })}><option value="normal">Regular</option><option value="bold">Bold</option></select></Field></div><Field label={`Font size · ${block.fontSize ?? (block.type === 'heading' ? 30 : 16)}px`} wide><input type="range" min="10" max="64" value={block.fontSize ?? (block.type === 'heading' ? 30 : 16)} onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })} /></Field></>}
    <div className="campaign-style-grid"><Field label={`${block.type === 'spacer' ? 'Height' : 'Padding'} · ${block.padding ?? 0}px`}><input type="range" min="0" max="80" value={block.padding ?? 0} onChange={(event) => onUpdate({ padding: Number(event.target.value) })} /></Field><Field label={`Corners · ${block.borderRadius ?? 0}px`}><input type="range" min="0" max="40" value={block.borderRadius ?? 0} onChange={(event) => onUpdate({ borderRadius: Number(event.target.value) })} /></Field></div>
    {block.type !== 'spacer' && <div className="campaign-style-grid"><Field label={`Border · ${block.borderWidth ?? 0}px`}><input type="range" min="0" max="8" value={block.borderWidth ?? 0} onChange={(event) => onUpdate({ borderWidth: Number(event.target.value) })} /></Field><Field label="Border colour"><input type="color" value={block.borderColor ?? '#d9c29a'} onChange={(event) => onUpdate({ borderColor: event.target.value })} /></Field></div>}
  </div><div className="campaign-inspector-actions"><button onClick={onDuplicate}><Copy /> Duplicate</button><button className="danger" onClick={onDelete}><Trash2 /> Delete</button></div></aside>
}

export function CampaignStudio({ initial, workspace, onClose, onChanged }: { initial: EmailCampaignDraft; workspace: EmailCampaignWorkspace; onClose: () => void; onChanged: () => Promise<void> }) {
  const { accounts, subscribers } = useAdminData()
  const normalised = useMemo(() => ({ ...initial, blocks: normaliseBlocks(initial.blocks) }), [initial])
  const [history, setHistory] = useState<History>({ past: [], present: normalised, future: [] })
  const draft = history.present
  const [stage, setStage] = useState<Stage>('design')
  const [selectedId, setSelectedId] = useState(draft.blocks[0]?.id ?? '')
  const [activeId, setActiveId] = useState('')
  const [paletteTab, setPaletteTab] = useState<'blocks' | 'templates'>('blocks')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [working, setWorking] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recipientSearch, setRecipientSearch] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [confirmSend, setConfirmSend] = useState<'send_now' | 'schedule' | ''>('')
  const baselineRef = useRef(stripRevision(normalised))
  const latestRef = useRef(draft)
  const savePromiseRef = useRef<Promise<EmailCampaign | null> | null>(null)
  latestRef.current = draft
  const dirty = stripRevision(draft) !== baselineRef.current
  useUnsavedChanges(dirty, 'Leave the campaign studio before the latest changes are saved?')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const commit = useCallback((update: (current: EmailCampaignDraft) => EmailCampaignDraft) => setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: update(current.present), future: [] })), [])
  const replacePresent = useCallback((update: (current: EmailCampaignDraft) => EmailCampaignDraft) => setHistory((current) => ({ ...current, present: update(current.present) })), [])
  const undo = useCallback(() => setHistory((current) => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current), [])
  const redo = useCallback(() => setHistory((current) => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current), [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); commit((current) => ({ ...current, blocks: removeBlock(current.blocks, selectedId).blocks })); setSelectedId('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commit, redo, selectedId, undo])

  const persist = useCallback(async (requireReady = false) => {
    if (savePromiseRef.current) await savePromiseRef.current
    const snapshot = latestRef.current
    const issue = requireReady ? validateCampaignDraft(snapshot) : ''
    if (issue) { setError(issue); return null }
    setSaveState('saving'); setError('')
    const promise = saveEmailCampaign(snapshot).then((saved) => {
      baselineRef.current = stripRevision({ ...snapshot, id: saved.id })
      latestRef.current = { ...latestRef.current, id: saved.id, revision: saved.revision }
      replacePresent((current) => ({ ...current, id: saved.id, revision: saved.revision }))
      setSaveState(stripRevision(latestRef.current) === stripRevision(snapshot) ? 'saved' : 'unsaved')
      return saved
    }).catch((saveError) => { setSaveState('failed'); setError(saveError instanceof Error ? saveError.message : 'The draft could not be saved.'); return null }).finally(() => { savePromiseRef.current = null })
    savePromiseRef.current = promise
    return promise
  }, [replacePresent])

  useEffect(() => {
    if (!dirty) return
    setSaveState('unsaved')
    const timer = window.setTimeout(() => void persist(false), 1200)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, persist])

  const selected = findBlock(draft.blocks, selectedId)
  const updateBlock = (id: string, values: Partial<EmailCampaignBlock>) => commit((current) => ({ ...current, blocks: mapBlock(current.blocks, id, (block) => ({ ...block, ...values })) }))
  const deleteBlock = (id: string) => { commit((current) => ({ ...current, blocks: removeBlock(current.blocks, id).blocks })); if (selectedId === id) setSelectedId('') }
  const copyBlock = (id: string) => commit((current) => { const location = findLocation(current.blocks, id); const block = findBlock(current.blocks, id); if (!location || !block) return current; return { ...current, blocks: insertBlock(current.blocks, duplicateBlock(block), location, location.index + 1) } })

  const targetFromOver = (overId: string) => {
    if (overId.startsWith('container:')) return { ...parseContainer(overId), index: Number.MAX_SAFE_INTEGER }
    const location = findLocation(latestRef.current.blocks, overId)
    return location ?? { parentId: null, columnIndex: null, index: latestRef.current.blocks.length }
  }
  const dragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const dragEnd = (event: DragEndEvent) => {
    const active = String(event.active.id); const over = event.over ? String(event.over.id) : ''
    setActiveId(''); if (!over) return
    const target = targetFromOver(over)
    if (active.startsWith('palette:')) {
      const type = active.slice(8) as EmailCampaignBlockType
      const block = createBlock(type)
      commit((current) => ({ ...current, blocks: insertBlock(current.blocks, block, target, target.index) }))
      setSelectedId(block.id); setInspectorOpen(true); return
    }
    if (active !== over) commit((current) => ({ ...current, blocks: moveBlock(current.blocks, active, target, target.index) }))
  }

  const candidates = useMemo(() => {
    const values = new Map<string, { email: string; label: string; subscribed: boolean; verified: boolean }>()
    subscribers.forEach((person) => { const email = person.email.toLowerCase(); values.set(email, { email, label: email, subscribed: person.status === 'subscribed', verified: false }) })
    accounts.forEach((account) => { if (!account.email || account.disabled) return; const email = account.email.toLowerCase(); const previous = values.get(email); values.set(email, { email, label: account.displayName ? `${account.displayName} · ${email}` : email, subscribed: previous?.subscribed ?? false, verified: account.emailVerified }) })
    return [...values.values()].filter((person) => draft.purpose === 'service' ? person.verified || person.subscribed : person.subscribed)
  }, [accounts, draft.purpose, subscribers])
  const filteredCandidates = candidates.filter((person) => person.label.toLowerCase().includes(recipientSearch.toLowerCase()))
  const recipientCount = draft.audience === 'mailing_list' ? workspace.audienceCounts.mailingList : draft.audience === 'all_accounts' ? workspace.audienceCounts.verifiedAccounts : draft.recipientEmails.length
  const validation = validateCampaignDraft(draft)

  const uploadImage = async (file: File) => {
    if (!selected) return
    setWorking('image'); setError('')
    try { updateBlock(selected.id, { url: await uploadEmailCampaignImage(draft.id ?? 'new', file) }) }
    catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'The image could not be uploaded.') }
    finally { setWorking('') }
  }
  const sendTest = async () => {
    if (validation) { setError(validation); return }
    setWorking('test'); setError('')
    try { await sendEmailCampaignTest(draft); setNotice('Test email accepted by the provider.'); await onChanged() }
    catch (testError) { setError(testError instanceof Error ? testError.message : 'The test could not be sent.') }
    finally { setWorking('') }
  }
  const sendCampaign = async () => {
    const mode = confirmSend; if (!mode) return
    if (mode === 'schedule' && !scheduleAt) { setError('Choose a date and time.'); setConfirmSend(''); return }
    setWorking(mode); setError('')
    try { const saved = await persist(true); if (!saved) return; await queueEmailCampaign(saved.id, mode, mode === 'schedule' ? new Date(scheduleAt).toISOString() : undefined); await onChanged(); onClose() }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'The campaign could not be queued.') }
    finally { setWorking(''); setConfirmSend('') }
  }

  const stageOrder: Stage[] = ['design', 'audience', 'review']
  const stageButton = (value: Stage, label: string, number: number) => <button className={stage === value ? 'active' : ''} onClick={() => setStage(value)}><span>{stageOrder.indexOf(stage) > stageOrder.indexOf(value) ? <Check /> : number}</span>{label}</button>
  return <div className="campaign-studio">
    <header className="campaign-studio-toolbar">
      <button className="campaign-icon-button back" aria-label="Back to campaigns" onClick={() => { if (!dirty || window.confirm('Leave before the latest changes are saved?')) onClose() }}><ArrowLeft /></button>
      <label className="campaign-name-field"><span>Campaign name</span><input value={draft.name} placeholder="Untitled campaign" maxLength={120} onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))} /></label>
      <div className={`campaign-save-state ${saveState}`} aria-live="polite"><span />{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'failed' ? 'Save failed' : 'Unsaved changes'}</div>
      <div className="campaign-toolbar-group"><button aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 /></button><button aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 /></button></div>
      <div className="campaign-toolbar-group viewport"><button className={viewport === 'desktop' ? 'active' : ''} aria-label="Desktop preview" onClick={() => setViewport('desktop')}><Monitor /></button><button className={viewport === 'mobile' ? 'active' : ''} aria-label="Mobile preview" onClick={() => setViewport('mobile')}><Smartphone /></button></div>
      <button className="campaign-toolbar-action" disabled={Boolean(working) || Boolean(validation) || !workspace.configured} onClick={() => void sendTest()}><Send />{working === 'test' ? 'Sending…' : 'Send test'}</button>
      <button className="campaign-toolbar-action primary" disabled={Boolean(working)} onClick={() => { void persist(false); setStage(stage === 'design' ? 'audience' : stage === 'audience' ? 'review' : 'review') }}><Save />{stage === 'review' ? 'Save draft' : 'Save & continue'}<ChevronRight /></button>
    </header>
    <nav className="campaign-studio-steps" aria-label="Campaign steps">{stageButton('design', 'Design', 1)}{stageButton('audience', 'Recipients & details', 2)}{stageButton('review', 'Review & send', 3)}</nav>
    <div className="campaign-studio-message-slot" data-testid="campaign-message-slot">
      {(error || notice) && <div className={`campaign-studio-message ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><button aria-label="Dismiss" onClick={() => { setError(''); setNotice('') }}><X /></button></div>}
    </div>

    {stage === 'design' && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={dragStart} onDragEnd={dragEnd}>
      <div className={`campaign-studio-workspace${inspectorOpen ? '' : ' inspector-closed'}`}>
        <aside className="campaign-library"><div className="campaign-library-tabs"><button className={paletteTab === 'blocks' ? 'active' : ''} onClick={() => setPaletteTab('blocks')}>Blocks</button><button className={paletteTab === 'templates' ? 'active' : ''} onClick={() => setPaletteTab('templates')}>Templates</button></div><div className="campaign-library-scroll">{paletteTab === 'blocks' ? <><p>Drag content onto the canvas or click to append it.</p><div className="campaign-palette-grid">{Object.keys(blockMeta).map((type) => <div key={type}><PaletteItem type={type as EmailCampaignBlockType} onAdd={() => { const block = createBlock(type as EmailCampaignBlockType); commit((current) => ({ ...current, blocks: [...current.blocks, block] })); setSelectedId(block.id); setInspectorOpen(true) }} /></div>)}</div></> : <><p>Start from a crafted layout. Applying a template can be undone.</p><div className="campaign-template-list">{campaignTemplates.map((template) => <button key={template.id} onClick={() => commit((current) => ({ ...current, blocks: template.blocks() }))}><Eye /><span><strong>{template.name}</strong><small>{template.description}</small></span><ChevronRight /></button>)}</div></>}</div></aside>
        <main className="campaign-canvas-stage"><div className="campaign-canvas-ruler"><Laptop /><span>{viewport === 'desktop' ? '640px email canvas' : 'Mobile recipient preview'}</span>{!inspectorOpen && <button onClick={() => setInspectorOpen(true)}><PanelRightOpen /> Open inspector</button>}</div><div className={`campaign-email-shell ${viewport}`}><div className="campaign-email-inbox"><small>FROM · Doxa Cards</small><strong>{draft.subject || 'Your subject line'}</strong><span>{draft.previewText || 'Inbox preview text will appear here.'}</span></div><div className="campaign-email-brand">Doxa <span>Treasury</span></div><DropColumn parentId={null} columnIndex={null} blocks={draft.blocks} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setInspectorOpen(true) }} onUpdate={updateBlock} onDelete={deleteBlock} onDuplicate={copyBlock} /><footer>{draft.purpose === 'marketing' ? <>You are receiving this because you asked to hear from Doxa Cards. <u>Unsubscribe</u> at any time.</> : <>This service message relates to your Doxa Cards account.</>}</footer></div></main>
        {inspectorOpen && <PropertiesInspector block={selected} working={working} onUpdate={(values) => selected && updateBlock(selected.id, values)} onUpload={(file) => void uploadImage(file)} onDuplicate={() => selected && copyBlock(selected.id)} onDelete={() => selected && deleteBlock(selected.id)} onClose={() => setInspectorOpen(false)} />}
      </div><DragOverlay>{activeId ? <div className="campaign-drag-overlay"><GripVertical />{activeId.startsWith('palette:') ? blockMeta[activeId.slice(8) as EmailCampaignBlockType].label : blockMeta[findBlock(draft.blocks, activeId)?.type ?? 'paragraph'].label}</div> : null}</DragOverlay>
    </DndContext>}

    {stage === 'audience' && <div className="campaign-details-stage"><section className="campaign-details-main"><div className="campaign-form-card"><p className="eyebrow">Inbox details</p><h2>How should this arrive?</h2><Field label="Internal campaign name" hint="Only administrators see this" wide><input maxLength={120} value={draft.name} onChange={(event) => commit((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Email subject" wide><input maxLength={140} value={draft.subject} onChange={(event) => commit((current) => ({ ...current, subject: event.target.value }))} /></Field><Field label="Inbox preview" wide><input maxLength={180} value={draft.previewText} onChange={(event) => commit((current) => ({ ...current, previewText: event.target.value }))} /></Field></div><div className="campaign-form-card"><p className="eyebrow">Purpose</p><h2>Classify this message</h2><div className="campaign-choice-grid"><button className={draft.purpose === 'marketing' ? 'selected' : ''} onClick={() => commit((current) => ({ ...current, purpose: 'marketing', audience: current.audience === 'all_accounts' ? 'mailing_list' : current.audience, recipientEmails: [] }))}><Mail /><strong>Marketing update</strong><small>For people who explicitly asked to hear from Doxa.</small></button><button className={draft.purpose === 'service' ? 'selected' : ''} onClick={() => commit((current) => ({ ...current, purpose: 'service', recipientEmails: [] }))}><Users /><strong>Service message</strong><small>Necessary account or order information only.</small></button></div></div><div className="campaign-form-card"><p className="eyebrow">Audience</p><h2>Choose recipients</h2><div className="campaign-choice-grid three"><button className={draft.audience === 'mailing_list' ? 'selected' : ''} onClick={() => commit((current) => ({ ...current, audience: 'mailing_list', recipientEmails: [] }))}><Users /><strong>Mailing list</strong><small>{workspace.audienceCounts.mailingList} confirmed</small></button><button disabled={draft.purpose !== 'service'} className={draft.audience === 'all_accounts' ? 'selected' : ''} onClick={() => commit((current) => ({ ...current, audience: 'all_accounts', recipientEmails: [] }))}><Users /><strong>Website accounts</strong><small>{draft.purpose === 'service' ? `${workspace.audienceCounts.verifiedAccounts} verified` : 'Service only'}</small></button><button className={draft.audience === 'individuals' ? 'selected' : ''} onClick={() => commit((current) => ({ ...current, audience: 'individuals' }))}><Users /><strong>Individuals</strong><small>{draft.recipientEmails.length} selected</small></button></div>{draft.audience === 'individuals' && <div className="campaign-recipient-picker"><SearchField value={recipientSearch} onChange={setRecipientSearch} placeholder="Search eligible people…" /><div>{filteredCandidates.map((person) => <label key={person.email}><input type="checkbox" checked={draft.recipientEmails.includes(person.email)} onChange={(event) => commit((current) => ({ ...current, recipientEmails: event.target.checked ? [...new Set([...current.recipientEmails, person.email])].slice(0, 250) : current.recipientEmails.filter((email) => email !== person.email) }))} /><span><strong>{person.label}</strong><small>{person.subscribed ? 'Confirmed subscriber' : 'Verified account'}</small></span></label>)}</div></div>}</div></section><aside className="campaign-audience-summary"><p className="eyebrow">Live audience</p><strong>{recipientCount}</strong><span>currently eligible recipient{recipientCount === 1 ? '' : 's'}</span><small>Eligibility and consent are checked again by the server at send time.</small><button className="campaign-toolbar-action primary" onClick={() => { void persist(false); setStage('review') }}>Review campaign <ChevronRight /></button></aside></div>}

    {stage === 'review' && <div className="campaign-review-stage"><section className="campaign-review-card"><p className="eyebrow">Final review</p><h1>{validation ? 'A few details need attention' : 'Ready when you are'}</h1><dl><div><dt>Campaign</dt><dd>{draft.name || 'Not named'}</dd></div><div><dt>Subject</dt><dd>{draft.subject || 'No subject'}</dd></div><div><dt>Purpose</dt><dd>{draft.purpose === 'marketing' ? 'Marketing update' : 'Service message'}</dd></div><div><dt>Audience</dt><dd>{draft.audience === 'mailing_list' ? 'Confirmed mailing list' : draft.audience === 'all_accounts' ? 'Verified website accounts' : `${draft.recipientEmails.length} selected people`}</dd></div><div><dt>Eligible now</dt><dd>{recipientCount}</dd></div></dl>{validation && <button className="campaign-review-warning" onClick={() => setStage(validation.includes('recipient') || validation.includes('campaign name') || validation.includes('subject') ? 'audience' : 'design')}><span>Not ready to send</span><strong>{validation}</strong><ChevronRight /></button>}<div className="campaign-send-actions"><button disabled={Boolean(validation) || !workspace.configured || !recipientCount || Boolean(working)} onClick={() => setConfirmSend('send_now')}><Send />Send now</button><div><label><CalendarClock /> Schedule<input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /></label><button disabled={Boolean(validation) || !workspace.configured || !recipientCount || !scheduleAt || Boolean(working)} onClick={() => setConfirmSend('schedule')}>Schedule</button></div></div></section><aside className="campaign-review-preview"><DndContext sensors={[]}><div className="campaign-email-shell desktop"><div className="campaign-email-inbox"><small>FROM · Doxa Cards</small><strong>{draft.subject || 'Your subject line'}</strong><span>{draft.previewText || 'Inbox preview text'}</span></div><div className="campaign-email-brand">Doxa <span>Treasury</span></div><DropColumn parentId={null} columnIndex={null} blocks={draft.blocks} selectedId="" onSelect={() => undefined} onUpdate={() => undefined} onDelete={() => undefined} onDuplicate={() => undefined} /></div></DndContext></aside></div>}
    <ConfirmDialog open={Boolean(confirmSend)} title={confirmSend === 'schedule' ? 'Schedule this campaign?' : 'Send this campaign now?'} description={confirmSend === 'schedule' ? `The campaign will be prepared for ${recipientCount} currently eligible recipient(s) at the selected time.` : `The campaign will be prepared for ${recipientCount} currently eligible recipient(s). Provider acceptance is not the same as confirmed delivery.`} confirmLabel={confirmSend === 'schedule' ? 'Schedule campaign' : 'Send campaign'} busy={working === confirmSend} onCancel={() => setConfirmSend('')} onConfirm={() => void sendCampaign()} />
  </div>
}

export { campaignToDraft }
