import { BookOpenCheck, Check, Copy, KeyRound, LockKeyhole, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { friendlyAuthError } from '../../context/AuthContext'
import { getMyTreasury, redeemTreasuryCode } from '../../lib/treasury'
import type { TreasuryState } from '../../types'

const emptyTreasury: TreasuryState = { editions: [], cards: [] }

function collectedDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function displayError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code === 'functions/unauthenticated' || code === 'functions/permission-denied') return 'Your secure session needs to be refreshed. Sign out, then sign in again before opening your Treasury.'
  const message = friendlyAuthError(error)
  if (/verified/i.test(message)) return 'Please verify your account email before adding cards to your Treasury.'
  if (/wait|many|exhausted/i.test(message)) return 'Please wait a few minutes before checking another code.'
  return message || 'That code could not be added. Check it carefully and try again.'
}

export function TreasuryPage() {
  const [state, setState] = useState<TreasuryState>(emptyTreasury)
  const [activeEdition, setActiveEdition] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newlyCollected, setNewlyCollected] = useState('')
  const statusRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const next = await getMyTreasury()
    setState(next)
    setActiveEdition((current) => current && next.editions.some((edition) => edition.id === current) ? current : next.editions[0]?.id || '')
  }

  useEffect(() => {
    let active = true
    void getMyTreasury().then((next) => {
      if (!active) return
      setState(next); setActiveEdition(next.editions[0]?.id || '')
    }).catch((loadError) => { if (active) setError(displayError(loadError)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const cards = useMemo(() => state.cards.filter((card) => card.editionId === activeEdition), [activeEdition, state.cards])
  const collected = cards.filter((card) => card.collected).length
  const active = state.editions.find((edition) => edition.id === activeEdition)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setError(''); setSuccess(''); setNewlyCollected('')
    try {
      const result = await redeemTreasuryCode(code)
      await load()
      setActiveEdition(result.edition.id)
      setNewlyCollected(result.card.id)
      setSuccess(result.retried ? `${result.card.title} is already safely in your Treasury.` : result.newCard ? `${result.card.title} has been added to your Treasury.` : `Another copy of ${result.card.title} has been added.`)
      setCode('')
      window.setTimeout(() => document.getElementById(`treasury-card-${result.card.id}`)?.focus(), 250)
    } catch (submissionError) {
      setError(displayError(submissionError))
      window.requestAnimationFrame(() => statusRef.current?.focus())
    } finally { setBusy(false) }
  }

  return <AccountCentreShell title="My Treasury" eyebrow="Your collection" description="Enter the code from a physical Doxa card to reveal it and keep track of your collection.">
    <section className="treasury-redeem-panel">
      <div className="treasury-redeem-icon" aria-hidden="true"><KeyRound /></div>
      <div className="treasury-redeem-copy"><p className="eyebrow">Unlock a card</p><h2>Add a card to your Treasury</h2><p>Each genuine card has a unique, one-time code. Type or paste it below exactly as printed.</p></div>
      <form onSubmit={submit} className="treasury-code-form">
        <label htmlFor="treasury-code">Card code</label>
        <div><input id="treasury-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 40))} placeholder="DXA-•••••-•••••-•••••-•••••-•••••" autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} /><button className="button primary" disabled={busy || code.trim().length < 10}>{busy ? 'Checking…' : 'Add to my Treasury'}</button></div>
        <small>Codes are single-use. Dashes and spaces are optional.</small>
      </form>
    </section>

    <div ref={statusRef} tabIndex={-1} className={`treasury-feedback ${success ? 'success' : error ? 'error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
      {success && <><Sparkles aria-hidden="true" /><span><strong>Card collected</strong>{success}</span></>}
      {error && <><LockKeyhole aria-hidden="true" /><span><strong>We could not add that card</strong>{error}</span></>}
    </div>

    {loading ? <div className="treasury-loading" role="status"><span aria-hidden="true" /><p>Opening your Treasury…</p></div> : !state.editions.length ? <section className="treasury-empty"><BookOpenCheck aria-hidden="true" /><h2>Your first collection is being prepared</h2><p>Published Doxa card sets will appear here. When your physical card arrives, return with its code to begin collecting.</p></section> : <section className="treasury-collection" aria-label="Your card collection">
      <header className="treasury-collection-header">
        <div className="treasury-edition-tabs" role="tablist" aria-label="Collection sets">{state.editions.map((edition) => {
          const editionCards = state.cards.filter((card) => card.editionId === edition.id)
          const count = editionCards.filter((card) => card.collected).length
          return <button key={edition.id} role="tab" aria-selected={activeEdition === edition.id} onClick={() => setActiveEdition(edition.id)}>{edition.title}<span>{count} of {editionCards.length}</span></button>
        })}</div>
        {active && <div className="treasury-edition-summary"><div><p className="eyebrow">Collection set</p><h2>{active.title}</h2><p>{active.description}</p></div><div className="treasury-progress-copy"><strong>{collected}<span> / {cards.length}</span></strong><small>cards collected</small></div></div>}
        <div className="treasury-progress" role="progressbar" aria-label={`${active?.title || 'Collection'} progress`} aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={collected}><span style={{ width: `${cards.length ? (collected / cards.length) * 100 : 0}%` }} /></div>
      </header>
      <div className="treasury-card-grid">{cards.map((card) => <article id={`treasury-card-${card.id}`} tabIndex={-1} key={card.id} className={`treasury-card ${card.collected ? 'collected' : 'locked'} ${newlyCollected === card.id ? 'just-collected' : ''}`}>
        <div className="treasury-card-art">
          {card.collected && card.imageUrl ? <img src={card.imageUrl} alt={card.imageAlt || ''} /> : <span className="treasury-card-number" aria-hidden="true">{card.number}</span>}
          <span className="treasury-card-state">{card.collected ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span>
        </div>
        <div className="treasury-card-body"><small>Card {card.number}</small><h3>{card.title}</h3><p>{card.collected ? card.teaser || 'Part of your Doxa collection.' : card.teaser || 'Enter the code from this card to reveal it.'}</p>
          {card.collected ? <><div className="treasury-card-meta"><span>Collected {collectedDate(card.firstCollectedAt)}</span>{(card.quantity || 0) > 1 && <span><Copy aria-hidden="true" /> {card.quantity} copies</span>}</div>{card.story && <details><summary>Read the card story</summary><p>{card.story}</p></details>}</> : <span className="treasury-locked-label"><LockKeyhole aria-hidden="true" /> Not yet collected</span>}
        </div>
      </article>)}</div>
    </section>}
  </AccountCentreShell>
}
