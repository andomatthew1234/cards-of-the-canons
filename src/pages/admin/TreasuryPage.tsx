import { BookOpenCheck, Check, Clipboard, Download, KeyRound, Plus, RefreshCw, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { generateTreasuryCodeBatch, getTreasuryAdminState, revokeTreasuryCodeBatch, saveTreasuryCard, saveTreasuryEdition } from '../../lib/treasury'
import type { TreasuryAdminState, TreasuryCard, TreasuryEdition } from '../../types'

const blankEdition: Omit<TreasuryEdition, 'id'> = { title: '', description: '', coverImageUrl: '', coverImageAlt: '', status: 'draft', sortOrder: 1 }
const blankCard = (editionId = ''): Omit<TreasuryCard, 'collected' | 'quantity' | 'firstCollectedAt' | 'lastCollectedAt'> => ({ id: '', editionId, number: '', title: '', teaser: '', story: '', imageUrl: '', imageAlt: '', status: 'draft', sortOrder: 1 })

export function TreasuryPage() {
  const [params] = useSearchParams()
  const orderId = params.get('order') || ''
  const [tab, setTab] = useState<'sets' | 'cards' | 'codes'>(orderId ? 'codes' : 'sets')
  const [state, setState] = useState<TreasuryAdminState>({ editions: [], cards: [], batches: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedEditionId, setSelectedEditionId] = useState('')
  const [edition, setEdition] = useState<Omit<TreasuryEdition, 'id'> & { id?: string; starterCardCount: number }>({ ...blankEdition, starterCardCount: 12 })
  const [card, setCard] = useState<ReturnType<typeof blankCard>>(blankCard())
  const [batch, setBatch] = useState({ cardId: '', quantity: 1, label: '', orderId })
  const [generated, setGenerated] = useState<{ batchId: string; codes: string[] } | null>(null)

  const load = async () => {
    setError('')
    const next = await getTreasuryAdminState()
    setState(next)
    setSelectedEditionId((current) => current || next.editions[0]?.id || '')
    setBatch((current) => ({ ...current, cardId: current.cardId || next.cards[0]?.id || '' }))
  }
  useEffect(() => { let active = true; void getTreasuryAdminState().then((next) => { if (active) { setState(next); setSelectedEditionId(next.editions[0]?.id || ''); setBatch((current) => ({ ...current, cardId: next.cards[0]?.id || '' })) } }).catch((loadError) => { if (active) setError(friendlyAuthError(loadError)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])

  const selectedCards = useMemo(() => state.cards.filter((item) => item.editionId === selectedEditionId), [selectedEditionId, state.cards])
  const editionName = (id: string) => state.editions.find((item) => item.id === id)?.title || 'Unknown set'
  const cardName = (id: string) => state.cards.find((item) => item.id === id)?.title || 'Unknown card'

  async function run(key: string, action: () => Promise<void>, message: string) {
    setBusy(key); setError(''); setNotice('')
    try { await action(); setNotice(message); await load() } catch (actionError) { setError(friendlyAuthError(actionError)) } finally { setBusy('') }
  }

  const saveEdition = (event: FormEvent) => {
    event.preventDefault()
    void run('edition', async () => {
      const id = await saveTreasuryEdition(edition)
      setSelectedEditionId(id); setEdition({ ...blankEdition, starterCardCount: 12 })
    }, edition.id ? 'Collection set updated.' : 'Collection set and starter card slots created.')
  }
  const editEdition = (item: TreasuryEdition) => setEdition({ ...item, starterCardCount: 0 })
  const saveCard = (event: FormEvent) => {
    event.preventDefault()
    void run('card', async () => { await saveTreasuryCard(card); setCard(blankCard(selectedEditionId)) }, card.id ? 'Card updated.' : 'Card added.')
  }
  const generate = (event: FormEvent) => {
    event.preventDefault()
    void run('codes', async () => { setGenerated(await generateTreasuryCodeBatch(batch)) }, 'Codes generated. Save or print them now; they cannot be shown again.')
  }
  const download = () => {
    if (!generated) return
    const selected = state.cards.find((item) => item.id === batch.cardId)
    const rows = ['Code,Collection set,Card,Order reference', ...generated.codes.map((code) => `"${code}","${editionName(selected?.editionId || '')}","${selected?.title || ''}","${batch.orderId}"`)]
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `doxa-card-codes-${generated.batchId}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  const copyCodes = async () => { if (generated) { await navigator.clipboard.writeText(generated.codes.join('\n')); setNotice('Codes copied to the clipboard.') } }
  const revoke = (id: string) => {
    const reason = window.prompt('Why are these unused codes being revoked?')?.trim()
    if (!reason) return
    void run(`revoke-${id}`, async () => { await revokeTreasuryCodeBatch(id, reason) }, 'Every unused code in the batch was revoked.')
  }

  if (loading) return <LoadingState label="Opening Treasury workspace…" />
  return <>
    <PageMeta title="Treasury & card codes — Admin" description="Manage collectible sets, cards and secure physical claim codes." />
    <AdminPageHeader eyebrow="Commerce" title="Treasury & card codes" description="Create collectible sets, prepare each card's reveal, and generate one-time codes for fulfilment." actions={<button className="button secondary" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Refresh</button>} />
    <nav className="treasury-admin-tabs" aria-label="Treasury workspace"><button className={tab === 'sets' ? 'active' : ''} onClick={() => setTab('sets')}>Collection sets</button><button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Cards</button><button className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>Card codes</button></nav>
    {error && <div className="admin-info-banner danger" role="alert"><ShieldX aria-hidden="true" /><div><strong>We could not complete this request</strong><p>{error}</p></div></div>}
    {notice && <div className="admin-info-banner positive" role="status"><Check aria-hidden="true" /><div><strong>Done</strong><p>{notice}</p></div></div>}

    {tab === 'sets' && <div className="treasury-admin-grid"><AdminPanel title="Collection sets" description="Each published set becomes a tab in every customer's Treasury.">
      {state.editions.length ? <div className="treasury-admin-list">{state.editions.map((item) => <button key={item.id} onClick={() => editEdition(item)}><BookOpenCheck aria-hidden="true" /><span><strong>{item.title}</strong><small>{state.cards.filter((cardItem) => cardItem.editionId === item.id).length} cards</small></span><StatusBadge tone={item.status === 'published' ? 'positive' : item.status === 'archived' ? 'warning' : 'neutral'}>{item.status}</StatusBadge></button>)}</div> : <EmptyState title="No collection sets yet" description="Create the first set and twelve editable card placeholders in one step." icon={<BookOpenCheck />} />}
    </AdminPanel><AdminPanel title={edition.id ? `Edit ${edition.title}` : 'Create a collection set'} description={edition.id ? 'Published changes appear in customer accounts immediately.' : 'The default creates twelve neutral placeholders ready for approved content.'}><form className="admin-form-stack" onSubmit={saveEdition}><Field label="Set title"><input required minLength={2} maxLength={120} value={edition.title} onChange={(event) => setEdition((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Description"><textarea rows={5} maxLength={1500} value={edition.description} onChange={(event) => setEdition((current) => ({ ...current, description: event.target.value }))} /></Field><div className="admin-form-grid"><Field label="Display order"><input type="number" min={0} max={10000} value={edition.sortOrder} onChange={(event) => setEdition((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field><Field label="Status"><select value={edition.status} onChange={(event) => setEdition((current) => ({ ...current, status: event.target.value as TreasuryEdition['status'] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field>{!edition.id && <Field label="Starter card slots"><input type="number" min={0} max={48} value={edition.starterCardCount} onChange={(event) => setEdition((current) => ({ ...current, starterCardCount: Number(event.target.value) }))} /></Field>}</div><Field label="Cover image URL"><input value={edition.coverImageUrl} onChange={(event) => setEdition((current) => ({ ...current, coverImageUrl: event.target.value }))} /></Field><Field label="Cover image alt text"><input maxLength={180} value={edition.coverImageAlt} onChange={(event) => setEdition((current) => ({ ...current, coverImageAlt: event.target.value }))} /></Field><div className="admin-page-actions"><button type="button" className="button secondary" onClick={() => setEdition({ ...blankEdition, starterCardCount: 12 })}>Clear</button><button className="button primary" disabled={busy === 'edition'}>{busy === 'edition' ? 'Saving…' : edition.id ? 'Save set' : 'Create set'}</button></div></form></AdminPanel></div>}

    {tab === 'cards' && <div className="treasury-admin-grid"><AdminPanel title="Cards" description="Choose a collection set, then edit its locked preview and revealed story."><Field label="Collection set"><select value={selectedEditionId} onChange={(event) => { setSelectedEditionId(event.target.value); setCard(blankCard(event.target.value)) }}><option value="">Choose a set</option>{state.editions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>{selectedCards.length ? <div className="treasury-admin-list card-list">{selectedCards.map((item) => <button key={item.id} onClick={() => setCard(item)}><span className="treasury-admin-card-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.teaser || 'No locked preview yet'}</small></span><StatusBadge tone={item.status === 'published' ? 'positive' : 'neutral'}>{item.status}</StatusBadge></button>)}</div> : <p className="admin-panel-empty">Choose a set or create its first card.</p>}<button className="button secondary grow" disabled={!selectedEditionId} onClick={() => setCard(blankCard(selectedEditionId))}><Plus /> Add card</button></AdminPanel>
      <AdminPanel title={card.id ? `Edit ${card.title}` : 'Card details'} description="The teaser is visible while locked. Story and full-colour artwork are returned only after collection."><form className="admin-form-stack" onSubmit={saveCard}><div className="admin-form-grid"><Field label="Card number"><input required maxLength={24} value={card.number} onChange={(event) => setCard((current) => ({ ...current, number: event.target.value }))} /></Field><Field label="Display order"><input required type="number" min={0} max={10000} value={card.sortOrder} onChange={(event) => setCard((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field></div><Field label="Title"><input required minLength={2} maxLength={140} value={card.title} onChange={(event) => setCard((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Locked preview"><textarea rows={3} maxLength={400} value={card.teaser} onChange={(event) => setCard((current) => ({ ...current, teaser: event.target.value }))} /></Field><Field label="Revealed story"><textarea rows={8} maxLength={12000} value={card.story} onChange={(event) => setCard((current) => ({ ...current, story: event.target.value }))} /></Field><Field label="Full-colour artwork URL"><input value={card.imageUrl} onChange={(event) => setCard((current) => ({ ...current, imageUrl: event.target.value }))} /></Field><Field label="Artwork alt text"><input maxLength={180} value={card.imageAlt} onChange={(event) => setCard((current) => ({ ...current, imageAlt: event.target.value }))} /></Field><Field label="Status"><select value={card.status} onChange={(event) => setCard((current) => ({ ...current, status: event.target.value as TreasuryCard['status'] }))}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></Field><button className="button primary grow" disabled={!card.editionId || busy === 'card'}>{busy === 'card' ? 'Saving…' : card.id ? 'Save card' : 'Add card'}</button></form></AdminPanel></div>}

    {tab === 'codes' && <div className="treasury-admin-grid"><AdminPanel title="Generate card codes" description="Codes are cryptographically generated and shown once. Print or download them before leaving."><form className="admin-form-stack" onSubmit={generate}><Field label="Card"><select required value={batch.cardId} onChange={(event) => setBatch((current) => ({ ...current, cardId: event.target.value }))}><option value="">Choose a card</option>{state.editions.map((editionItem) => <optgroup key={editionItem.id} label={editionItem.title}>{state.cards.filter((item) => item.editionId === editionItem.id).map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}</optgroup>)}</select></Field><div className="admin-form-grid"><Field label="Number of codes"><input required type="number" min={1} max={100} value={batch.quantity} onChange={(event) => setBatch((current) => ({ ...current, quantity: Number(event.target.value) }))} /></Field><Field label="Batch label"><input required minLength={2} maxLength={120} placeholder="e.g. October packing run" value={batch.label} onChange={(event) => setBatch((current) => ({ ...current, label: event.target.value }))} /></Field></div><Field label="Order reference" hint="Optional. The code still follows the physical card if it is gifted."><input maxLength={160} value={batch.orderId} onChange={(event) => setBatch((current) => ({ ...current, orderId: event.target.value }))} /></Field><button className="button primary grow" disabled={!batch.cardId || busy === 'codes'}><KeyRound />{busy === 'codes' ? 'Generating securely…' : 'Generate one-time codes'}</button></form>
      {generated && <section className="treasury-generated-codes"><header><div><p className="eyebrow">Save now</p><h3>{generated.codes.length} new codes</h3></div><div><button className="button secondary" onClick={() => void copyCodes()}><Clipboard /> Copy</button><button className="button secondary" onClick={download}><Download /> CSV</button></div></header><p>For security, these codes are not stored in readable form and cannot be displayed again.</p><pre>{generated.codes.join('\n')}</pre></section>}
      </AdminPanel><AdminPanel title="Recent code batches" description="Only masked totals are retained after generation. Redeemed codes cannot be undone.">{state.batches.length ? <div className="treasury-batch-list">{state.batches.map((item) => <article key={item.id}><div><strong>{item.label}</strong><span>{editionName(item.editionId)} · {cardName(item.cardId)}</span>{item.orderId && <small>Order {item.orderId}</small>}</div><dl><div><dt>Generated</dt><dd>{item.quantity}</dd></div><div><dt>Redeemed</dt><dd>{item.redeemedCount}</dd></div><div><dt>Revoked</dt><dd>{item.revokedCount}</dd></div></dl><StatusBadge tone={item.status === 'active' ? 'positive' : 'warning'}>{item.status}</StatusBadge>{item.status === 'active' && item.quantity > item.redeemedCount + item.revokedCount && <button className="text-button danger" disabled={busy === `revoke-${item.id}`} onClick={() => revoke(item.id)}>Revoke unused</button>}</article>)}</div> : <EmptyState title="No code batches yet" description="Generated batches and their redemption totals will appear here." icon={<KeyRound />} />}</AdminPanel></div>}
  </>
}
