import { ArrowRightLeft, BookOpenCheck, Check, Copy, KeyRound, LockKeyhole, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { friendlyAuthError } from '../../context/AuthContext'
import { beginTreasuryRedemption, getMyTreasury, redeemPhysicalTreasuryCards, transferTreasuryCard } from '../../lib/treasury'
import type { TreasuryOwnedCopy, TreasuryRedemptionSession, TreasuryState } from '../../types'

const emptyTreasury: TreasuryState = { editions: [], cards: [], uniqueCollected: 0, totalAvailable: 0, completionPercentage: 0 }

function collectedDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function displayError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
  const message = friendlyAuthError(error)
  if (code === 'functions/unauthenticated') return 'Please sign in again before opening your Treasury.'
  if (/verified/i.test(message)) return 'Please verify your account email before revealing or transferring cards.'
  if (/wait|many|exhausted/i.test(message)) return 'Please wait a few minutes before trying again.'
  return message || 'The Treasury could not complete that request. Please try again.'
}

function normaliseCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

export function TreasuryPage() {
  const [state, setState] = useState<TreasuryState>(emptyTreasury)
  const [activeEdition, setActiveEdition] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newlyCollected, setNewlyCollected] = useState<string[]>([])
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [session, setSession] = useState<TreasuryRedemptionSession | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [invalidFields, setInvalidFields] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transfer, setTransfer] = useState<{ copy: TreasuryOwnedCopy; title: string } | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const dialogTitleRef = useRef<HTMLHeadingElement>(null)
  const redeemTriggerRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    if (redeemOpen || transfer) window.requestAnimationFrame(() => dialogTitleRef.current?.focus())
  }, [redeemOpen, transfer, confirming])

  useEffect(() => {
    if (!redeemOpen && !transfer) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      if (confirming) setConfirming(false)
      else if (transfer) setTransfer(null)
      else closeRedeem()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow }
  }, [busy, confirming, redeemOpen, transfer])

  const cards = useMemo(() => state.cards.filter((card) => card.editionId === activeEdition), [activeEdition, state.cards])
  const collected = cards.filter((card) => card.collected).length
  const active = state.editions.find((edition) => edition.id === activeEdition)

  const closeRedeem = () => {
    if (busy) return
    setRedeemOpen(false); setConfirming(false); setSession(null); setCodes([]); setInvalidFields(new Set()); setOrderId('')
  }

  const findOrder = async (event: FormEvent) => {
    event.preventDefault()
    if (!orderId.trim() || busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const next = await beginTreasuryRedemption(orderId.trim().replace(/^#/, ''))
      if (next.remainingCodeCount === 0) {
        setSuccess('Every Saint from this order has already been revealed.')
        setRedeemOpen(false); setSession(null); setCodes([]); setOrderId('')
        window.requestAnimationFrame(() => redeemTriggerRef.current?.focus())
        return
      }
      setSession(next)
      setOrderId(next.orderId)
      setCodes(Array.from({ length: next.remainingCodeCount }, () => ''))
      setInvalidFields(new Set())
    } catch (lookupError) { setError(displayError(lookupError)) }
    finally { setBusy(false) }
  }

  const reviewCodes = (event: FormEvent) => {
    event.preventDefault()
    if (!session || codes.some((code) => code.length !== 7)) {
      setError('Enter every seven-character code exactly as it appears on your physical cards.')
      return
    }
    setError(''); setConfirming(true)
  }

  const redeem = async () => {
    if (!session || busy) return
    setBusy(true); setError(''); setSuccess(''); setInvalidFields(new Set())
    try {
      const submitted = [...codes]
      const result = await redeemPhysicalTreasuryCards(session.orderId, submitted)
      setSession(result)
      setNewlyCollected(result.accepted.map((item) => item.cardId))
      await load()
      if (result.accepted.length) setSuccess(`${result.accepted.length} Saint${result.accepted.length === 1 ? '' : 's'} revealed and added to your Treasury.`)
      if (result.rejected.length) {
        const remainingValues = result.rejected.map((item) => submitted[item.index])
        setCodes(Array.from({ length: result.remainingCodeCount }, (_, index) => remainingValues[index] || ''))
        setInvalidFields(new Set(remainingValues.map((_, index) => index)))
        setError(result.locked
          ? 'The valid cards were revealed, but this order has reached its retry limit. Contact Doxa for help with the remaining code.'
          : `The valid cards were revealed. Check the highlighted code${result.rejected.length === 1 ? '' : 's'} and try again. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} remaining.`)
      } else if (result.remainingCodeCount === 0) {
        setRedeemOpen(false); setSession(null); setCodes([]); setInvalidFields(new Set()); setOrderId('')
        window.requestAnimationFrame(() => redeemTriggerRef.current?.focus())
      }
      else setCodes(Array.from({ length: result.remainingCodeCount }, () => ''))
    } catch (redemptionError) { setError(displayError(redemptionError)) }
    finally { setBusy(false); setConfirming(false) }
  }

  const completeTransfer = async (event: FormEvent) => {
    event.preventDefault()
    if (!transfer || !recipientEmail.trim() || busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await transferTreasuryCard(transfer.copy.id, recipientEmail.trim())
      await load()
      setSuccess(`${transfer.title} was transferred to ${result.recipientEmail}.`)
      setTransfer(null); setRecipientEmail('')
    } catch (transferError) { setError(displayError(transferError)) }
    finally { setBusy(false) }
  }

  return <AccountCentreShell title="My Treasury" eyebrow="Your collection" description="Reveal the Saints printed in your orders, keep duplicates, and share individual cards with another collector.">
    <section className="treasury-hero-panel">
      <div><p className="eyebrow">Collection progress</p><strong>{state.completionPercentage ?? 0}%</strong><span>{state.uniqueCollected ?? 0} of {state.totalAvailable ?? 0} unique Saints revealed</span></div>
      <button ref={redeemTriggerRef} className="treasury-redeem-trigger" disabled={state.treasuryBanned} onClick={() => { setRedeemOpen(true); setError(''); setSuccess('') }}><KeyRound aria-hidden="true" /><span><strong>Redeem Cards</strong><small>{state.treasuryBanned ? 'Contact Doxa for assistance' : 'Use your order number and physical card codes'}</small></span></button>
    </section>

    {success && <div className="treasury-feedback success" role="status" aria-live="polite"><Sparkles aria-hidden="true" /><span><strong>Treasury updated</strong>{success}</span></div>}
    {error && <div className="treasury-feedback error" role="alert"><LockKeyhole aria-hidden="true" /><span><strong>Check this request</strong>{error}</span></div>}

    {loading ? <div className="treasury-loading" role="status"><span aria-hidden="true" /><p>Opening your Treasury…</p></div> : !state.editions.length ? <section className="treasury-empty"><BookOpenCheck aria-hidden="true" /><h2>Your first collection is being prepared</h2><p>Published Doxa card sets will appear here. When your physical cards arrive, return with your order number and printed codes.</p></section> : <section className="treasury-collection" aria-label="Your card collection">
      <header className="treasury-collection-header">
        <div className="treasury-edition-tabs" role="tablist" aria-label="Collection sets">{state.editions.map((edition) => {
          const editionCards = state.cards.filter((card) => card.editionId === edition.id)
          const count = editionCards.filter((card) => card.collected).length
          return <button key={edition.id} role="tab" aria-selected={activeEdition === edition.id} onClick={() => setActiveEdition(edition.id)}>{edition.title}<span>{count} of {editionCards.length}</span></button>
        })}</div>
        {active && <div className="treasury-edition-summary"><div><p className="eyebrow">Collection set</p><h2>{active.title}</h2><p>{active.description}</p></div><div className="treasury-progress-copy"><strong>{collected}<span> / {cards.length}</span></strong><small>unique Saints collected</small></div></div>}
        <div className="treasury-progress" role="progressbar" aria-label={`${active?.title || 'Collection'} progress`} aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={collected}><span style={{ width: `${cards.length ? (collected / cards.length) * 100 : 0}%` }} /></div>
      </header>
      <div className="treasury-card-grid">{cards.map((card) => <article id={`treasury-card-${card.id}`} tabIndex={-1} key={card.id} className={`treasury-card ${card.collected ? 'collected' : 'locked'} ${newlyCollected.includes(card.id) ? 'just-collected' : ''}`}>
        <div className="treasury-card-art">{card.collected && card.imageUrl ? <img src={card.imageUrl} alt={card.imageAlt || ''} /> : <span className="treasury-card-number" aria-hidden="true">{card.number}</span>}<span className="treasury-card-state">{card.collected ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</span></div>
        <div className="treasury-card-body"><small>Card {card.number}</small><h3>{card.title}</h3><p>{card.collected ? card.teaser || 'Part of your Doxa collection.' : card.teaser || 'Reveal the code printed on this card to add it.'}</p>
          {card.collected ? <><div className="treasury-card-meta"><span>Collected {collectedDate(card.firstCollectedAt)}</span>{(card.quantity || 0) > 1 && <span><Copy aria-hidden="true" /> {card.quantity} copies</span>}</div>{card.story && <details><summary>Read the card story</summary><p>{card.story}</p></details>}<div className="treasury-copy-list">{(card.copies || []).map((copy, index) => <button key={copy.id} disabled={state.treasuryBanned} onClick={() => { setTransfer({ copy, title: card.title }); setRecipientEmail(''); setError(''); setSuccess('') }}><span>Copy {index + 1}{copy.productionNumber ? ` · No. ${String(copy.productionNumber).padStart(4, '0')}` : ''}</span><ArrowRightLeft aria-hidden="true" /> {state.treasuryBanned ? 'Unavailable' : 'Transfer'}</button>)}</div></> : <span className="treasury-locked-label"><LockKeyhole aria-hidden="true" /> Not yet collected</span>}
        </div>
      </article>)}</div>
    </section>}

    {redeemOpen && <div className="treasury-dialog-backdrop" aria-hidden={confirming || undefined} onMouseDown={(event) => { if (event.target === event.currentTarget) closeRedeem() }}><section className="treasury-dialog" role="dialog" aria-modal={!confirming} aria-labelledby="treasury-redeem-title">
      <button className="treasury-dialog-close" aria-label="Close redemption" disabled={busy} onClick={closeRedeem}><X /></button>
      {error && <p className="treasury-dialog-error" role="alert">{error}</p>}
      {!session ? <form onSubmit={findOrder}><p className="eyebrow">Redeem physical cards</p><h2 id="treasury-redeem-title" ref={dialogTitleRef} tabIndex={-1}>Find your order</h2><p>Enter the order number from your Doxa receipt. Your cards must have arrived so you can read the unique codes printed on them.</p><label>Order number<input autoFocus value={orderId} onChange={(event) => setOrderId(event.target.value.slice(0, 128))} placeholder="co_…" autoComplete="off" /></label><button className="button primary grow" disabled={!orderId.trim() || busy}>{busy ? 'Finding order…' : 'Continue'}</button></form> : <form onSubmit={reviewCodes}><p className="eyebrow">Order #{session.orderId}</p><h2 id="treasury-redeem-title" ref={dialogTitleRef} tabIndex={-1}>You have {session.remainingCodeCount} Saint{session.remainingCodeCount === 1 ? '' : 's'} to reveal</h2><p>Enter each seven-character code exactly as printed. Valid codes will still be accepted if another entry needs correcting.</p><div className="treasury-code-stack">{codes.map((code, index) => <label key={index}><span>Card code {index + 1}</span><input className={invalidFields.has(index) ? 'invalid shake' : ''} value={code} onChange={(event) => { const value = normaliseCode(event.target.value); setCodes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item)); setInvalidFields((current) => { const next = new Set(current); next.delete(index); return next }) }} placeholder="A010001" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={invalidFields.has(index)} /></label>)}</div><small>{session.attemptsRemaining} correction attempt{session.attemptsRemaining === 1 ? '' : 's'} available for incorrect codes.</small><button className="button primary grow" disabled={busy || session.locked || codes.some((code) => code.length !== 7)}>Check my codes</button></form>}
    </section></div>}

    {confirming && <div className="treasury-dialog-backdrop"><section className="treasury-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="treasury-confirm-title"><Sparkles aria-hidden="true" /><h2 id="treasury-confirm-title" ref={dialogTitleRef} tabIndex={-1}>Check your codes</h2><p>Compare every entry with the code printed on your physical cards. Incorrect entries use one correction attempt, while valid cards will be revealed immediately.</p><div><button className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>Check again</button><button className="button primary" disabled={busy} onClick={() => void redeem()}>{busy ? 'Revealing…' : 'Reveal my Saints'}</button></div></section></div>}

    {transfer && <div className="treasury-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setTransfer(null) }}><section className="treasury-dialog compact" role="dialog" aria-modal="true" aria-labelledby="treasury-transfer-title"><button className="treasury-dialog-close" aria-label="Close transfer" disabled={busy} onClick={() => setTransfer(null)}><X /></button><form onSubmit={completeTransfer}><p className="eyebrow">Transfer one collected copy</p><h2 id="treasury-transfer-title" ref={dialogTitleRef} tabIndex={-1}>Send {transfer.title}</h2><p>The selected copy will leave your collection and appear in the recipient's Doxa Treasury.</p><label>Recipient account email<input autoFocus required type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="collector@example.com" autoComplete="email" /></label><button className="button primary grow" disabled={busy || !recipientEmail.trim()}>{busy ? 'Transferring…' : 'Transfer this card'}</button></form></section></div>}
  </AccountCentreShell>
}
