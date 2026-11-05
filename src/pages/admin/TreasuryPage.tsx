import { Activity, BookOpenCheck, Check, Plus, RefreshCw, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { useUnsavedChanges } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { getTreasuryAdminState, saveTreasuryCard, saveTreasuryEdition } from '../../lib/treasury'
import type { TreasuryAdminState, TreasuryCard, TreasuryEdition } from '../../types'

const blankEdition: Omit<TreasuryEdition, 'id'> = { title: '', description: '', coverImageUrl: '', coverImageAlt: '', status: 'draft', sortOrder: 1, codePrefix: 'A' }
const blankCard = (editionId = ''): Omit<TreasuryCard, 'collected' | 'quantity' | 'firstCollectedAt' | 'lastCollectedAt'> => ({ id: '', editionId, number: '', title: '', teaser: '', story: '', imageUrl: '', imageAlt: '', status: 'draft', sortOrder: 1 })
const initialEdition = () => ({ ...blankEdition, starterCardCount: 12 })

export function TreasuryPage() {
  const [tab, setTab] = useState<'sets' | 'cards' | 'activity'>('sets')
  const [state, setState] = useState<TreasuryAdminState>({ editions: [], cards: [], batches: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedEditionId, setSelectedEditionId] = useState('')
  const [edition, setEdition] = useState<Omit<TreasuryEdition, 'id'> & { id?: string; starterCardCount: number }>(initialEdition)
  const [editionBaseline, setEditionBaseline] = useState(() => JSON.stringify(initialEdition()))
  const [card, setCard] = useState<ReturnType<typeof blankCard>>(blankCard())
  const [cardBaseline, setCardBaseline] = useState(() => JSON.stringify(blankCard()))
  const editionDirty = JSON.stringify(edition) !== editionBaseline
  const cardDirty = JSON.stringify(card) !== cardBaseline
  useUnsavedChanges(editionDirty || cardDirty, 'Leave Treasury and discard unsaved set or card changes?')

  const load = async () => {
    setError('')
    const next = await getTreasuryAdminState()
    setState(next)
    setSelectedEditionId((current) => current || next.editions[0]?.id || '')
  }
  useEffect(() => { let active = true; void getTreasuryAdminState().then((next) => { if (active) { setState(next); setSelectedEditionId(next.editions[0]?.id || '') } }).catch((loadError) => { if (active) setError(friendlyAuthError(loadError)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])

  const selectedCards = useMemo(() => state.cards.filter((item) => item.editionId === selectedEditionId), [selectedEditionId, state.cards])

  async function run(key: string, action: () => Promise<void>, message: string) {
    setBusy(key); setError(''); setNotice('')
    try { await action(); setNotice(message); await load() } catch (actionError) { setError(friendlyAuthError(actionError)) } finally { setBusy('') }
  }

  const saveEdition = (event: FormEvent) => {
    event.preventDefault()
    void run('edition', async () => {
      const id = await saveTreasuryEdition(edition)
      const reset = initialEdition()
      setSelectedEditionId(id); setEdition(reset); setEditionBaseline(JSON.stringify(reset))
    }, edition.id ? 'Collection set updated.' : 'Collection set and starter card slots created.')
  }
  const editEdition = (item: TreasuryEdition) => {
    if (editionDirty && !window.confirm('Discard the unsaved collection-set changes?')) return
    const next = { ...item, starterCardCount: 0 }
    setEdition(next); setEditionBaseline(JSON.stringify(next))
  }
  const saveCard = (event: FormEvent) => {
    event.preventDefault()
    void run('card', async () => { await saveTreasuryCard(card); const reset = blankCard(selectedEditionId); setCard(reset); setCardBaseline(JSON.stringify(reset)) }, card.id ? 'Card updated.' : 'Card added.')
  }

  if (loading) return <LoadingState label="Opening Treasury workspace…" />
  return <>
    <PageMeta title="Treasury & card codes — Admin" description="Manage collectible sets, cards and secure physical claim codes." />
    <AdminPageHeader eyebrow="Commerce" title="Treasury & physical cards" description="Manage collection sets and Saints. Printed codes are assigned securely from each paid order while it is packed." actions={<button className="button secondary" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Refresh</button>} />
    <nav className="treasury-admin-tabs" aria-label="Treasury workspace"><button className={tab === 'sets' ? 'active' : ''} onClick={() => setTab('sets')}>Collection sets</button><button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Cards</button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button></nav>
    {error && <div className="admin-info-banner danger" role="alert"><ShieldX aria-hidden="true" /><div><strong>We could not complete this request</strong><p>{error}</p></div></div>}
    {notice && <div className="admin-info-banner positive" role="status"><Check aria-hidden="true" /><div><strong>Done</strong><p>{notice}</p></div></div>}

    {tab === 'sets' && <div className="treasury-admin-grid"><AdminPanel title="Collection sets" description="Each published set becomes a tab in every customer's Treasury.">
      {state.editions.length ? <div className="treasury-admin-list">{state.editions.map((item) => <button key={item.id} onClick={() => editEdition(item)}><BookOpenCheck aria-hidden="true" /><span><strong>{item.title}</strong><small>{state.cards.filter((cardItem) => cardItem.editionId === item.id).length} cards</small></span><StatusBadge tone={item.status === 'published' ? 'positive' : item.status === 'archived' ? 'warning' : 'neutral'}>{item.status}</StatusBadge></button>)}</div> : <EmptyState title="No collection sets yet" description="Create the first set and twelve editable card placeholders in one step." icon={<BookOpenCheck />} />}
    </AdminPanel><AdminPanel title={edition.id ? `Edit ${edition.title}` : 'Create a collection set'} description={edition.id ? 'Published changes appear in customer accounts immediately.' : 'The default creates twelve neutral placeholders ready for approved content.'}><form className="admin-form-stack" onSubmit={saveEdition}><Field label="Set title"><input required minLength={2} maxLength={120} value={edition.title} onChange={(event) => setEdition((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Description"><textarea rows={5} maxLength={1500} value={edition.description} onChange={(event) => setEdition((current) => ({ ...current, description: event.target.value }))} /></Field><div className="admin-form-grid"><Field label="Physical code letter" hint="A identifies the 12 Disciples set in codes such as A010001."><input required maxLength={1} pattern="[A-Za-z]" value={edition.codePrefix || ''} onChange={(event) => setEdition((current) => ({ ...current, codePrefix: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} /></Field><Field label="Display order"><input type="number" min={0} max={10000} value={edition.sortOrder} onChange={(event) => setEdition((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field><Field label="Status"><select value={edition.status} onChange={(event) => setEdition((current) => ({ ...current, status: event.target.value as TreasuryEdition['status'] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>{!edition.id && <Field label="Starter card slots"><input type="number" min={0} max={48} value={edition.starterCardCount} onChange={(event) => setEdition((current) => ({ ...current, starterCardCount: Number(event.target.value) }))} /></Field>}</div><Field label="Cover image URL"><input value={edition.coverImageUrl} onChange={(event) => setEdition((current) => ({ ...current, coverImageUrl: event.target.value }))} /></Field><Field label="Cover image alt text"><input maxLength={180} value={edition.coverImageAlt} onChange={(event) => setEdition((current) => ({ ...current, coverImageAlt: event.target.value }))} /></Field><div className="admin-page-actions"><button type="button" className="button secondary" onClick={() => { const reset = initialEdition(); setEdition(reset); setEditionBaseline(JSON.stringify(reset)) }}>Clear</button><button className="button primary" disabled={busy === 'edition'}>{busy === 'edition' ? 'Saving…' : edition.id ? 'Save set' : 'Create set'}</button></div></form></AdminPanel></div>}

    {tab === 'cards' && <div className="treasury-admin-grid"><AdminPanel title="Cards" description="Choose a collection set, then edit its locked preview and revealed story."><Field label="Collection set"><select value={selectedEditionId} onChange={(event) => { if (cardDirty && !window.confirm('Discard the unsaved card changes?')) return; const reset = blankCard(event.target.value); setSelectedEditionId(event.target.value); setCard(reset); setCardBaseline(JSON.stringify(reset)) }}><option value="">Choose a set</option>{state.editions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>{selectedCards.length ? <div className="treasury-admin-list card-list">{selectedCards.map((item) => <button key={item.id} onClick={() => { if (cardDirty && !window.confirm('Discard the unsaved card changes?')) return; setCard(item); setCardBaseline(JSON.stringify(item)) }}><span className="treasury-admin-card-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.teaser || 'No locked preview yet'}</small></span><StatusBadge tone={item.status === 'published' ? 'positive' : 'neutral'}>{item.status}</StatusBadge></button>)}</div> : <p className="admin-panel-empty">Choose a set or create its first card.</p>}<button className="button secondary grow" disabled={!selectedEditionId} onClick={() => { if (cardDirty && !window.confirm('Discard the unsaved card changes?')) return; const reset = blankCard(selectedEditionId); setCard(reset); setCardBaseline(JSON.stringify(reset)) }}><Plus /> Add card</button></AdminPanel>
      <AdminPanel title={card.id ? `Edit ${card.title}` : 'Card details'} description="The teaser is visible while locked. Story and full-colour artwork are returned only after collection."><form className="admin-form-stack" onSubmit={saveCard}><div className="admin-form-grid"><Field label="Card position (01–99)"><input required inputMode="numeric" pattern="(?:0?[1-9]|[1-9][0-9])" maxLength={2} placeholder="01" value={card.number} onChange={(event) => setCard((current) => ({ ...current, number: event.target.value.replace(/[^0-9]/g, '') }))} /></Field><Field label="Display order"><input required type="number" min={0} max={10000} value={card.sortOrder} onChange={(event) => setCard((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field></div><Field label="Title"><input required minLength={2} maxLength={140} value={card.title} onChange={(event) => setCard((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Locked preview"><textarea rows={3} maxLength={400} value={card.teaser} onChange={(event) => setCard((current) => ({ ...current, teaser: event.target.value }))} /></Field><Field label="Revealed story"><textarea rows={8} maxLength={12000} value={card.story} onChange={(event) => setCard((current) => ({ ...current, story: event.target.value }))} /></Field><Field label="Full-colour artwork URL"><input value={card.imageUrl} onChange={(event) => setCard((current) => ({ ...current, imageUrl: event.target.value }))} /></Field><Field label="Artwork alt text"><input maxLength={180} value={card.imageAlt} onChange={(event) => setCard((current) => ({ ...current, imageAlt: event.target.value }))} /></Field><Field label="Status"><select value={card.status} onChange={(event) => setCard((current) => ({ ...current, status: event.target.value as TreasuryCard['status'] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field><button className="button primary grow" disabled={!card.editionId || busy === 'card'}>{busy === 'card' ? 'Saving…' : card.id ? 'Save card' : 'Add card'}</button></form></AdminPanel></div>}

    {tab === 'activity' && <AdminPanel title="Treasury activity" description="The 200 most recent printed-code assignments, redemptions, transfers and administrator corrections.">
      <div className="admin-info-banner"><Activity aria-hidden="true" /><div><strong>Codes now follow the physical cards</strong><p>Assign printed seven-character codes from the paid order while packing it. The server binds each code to that order before a customer can redeem it.</p></div></div>
      {state.transactions?.length ? <div className="treasury-activity-list">{state.transactions.map((item) => <article key={item.id}>
        <Activity aria-hidden="true" />
        <div><strong>{item.type.replaceAll('_', ' ')}</strong><span>{item.detail || 'Treasury activity recorded.'}</span><small><Link to={`/admin/customers/${encodeURIComponent(item.accountId)}`}>Customer</Link>{item.otherAccountId && <> · <Link to={`/admin/customers/${encodeURIComponent(item.otherAccountId)}`}>Recipient</Link></>}{item.orderId && <> · <Link to={`/admin/orders/${encodeURIComponent(item.orderId)}`}>Order #{item.orderId}</Link></>}{item.cardId && ` · Card ${item.cardId}`}{item.codeSuffix && ` · Code •••${item.codeSuffix}`}</small></div>
        <time dateTime={item.createdAt || undefined}>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-AU') : 'Just now'}</time>
      </article>)}</div> : <EmptyState title="No Treasury activity yet" description="Assignments, redemptions, transfers and administrator changes will appear here." icon={<Activity />} />}
    </AdminPanel>}
  </>
}
