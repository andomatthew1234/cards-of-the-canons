import { CheckCircle2, Clock3, FlaskConical, KeyRound, ShoppingBag, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { formatMoney } from '../config'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { cancelCheckout, getOrderForUser } from '../lib/data'
import type { Order } from '../types'

function orderIsComplete(order: Order | null) {
  return Boolean(order && ['paid', 'fulfilled', 'payment_failed', 'payment_review', 'checkout_failed', 'cancelled'].includes(order.status))
}

export function CheckoutSuccess() {
  const { user, loading: authLoading } = useAuth()
  const { clear } = useCart()
  const [params] = useSearchParams()
  const location = useLocation()
  const orderId = params.get('order') ?? ''
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const cleared = useRef(false)

  useEffect(() => {
    if (!user || !orderId) return
    let active = true
    let timer: number | undefined
    let attempts = 0
    const refresh = async () => {
      try {
        const next = await getOrderForUser(orderId)
        if (!active) return
        setOrder(next)
        if (next && ['paid', 'fulfilled'].includes(next.status) && !cleared.current) {
          cleared.current = true
          clear()
        }
        attempts += 1
        if (!orderIsComplete(next) && attempts < 20) timer = window.setTimeout(refresh, 2000)
      } catch {
        if (active) setError('We could not refresh this order yet. You can safely check it from your account shortly.')
      }
    }
    void refresh()
    return () => { active = false; if (timer) window.clearTimeout(timer) }
  }, [clear, orderId, user])

  if (authLoading) return <section className="checkout-result"><Clock3 className="checkout-result-icon" /><h1>Verifying your payment</h1></section>
  if (!user) return <Navigate to="/account" replace state={{ from: `${location.pathname}${location.search}` }} />
  if (!orderId) return <CheckoutProblem title="Order reference missing" message="Return to your cart and start checkout again." />
  if (error) return <CheckoutProblem title="Confirmation is taking longer than expected" message={error} />

  const paid = order && ['paid', 'fulfilled'].includes(order.status)
  const failed = order && ['payment_failed', 'checkout_failed', 'cancelled'].includes(order.status)
  const review = order?.status === 'payment_review'
  const isTest = order?.paymentEnvironment === 'test'
  const title = paid ? isTest ? 'Test payment complete' : 'Payment received' : review ? 'Payment requires review' : failed ? 'Checkout was not completed' : 'Confirming your payment…'
  const message = paid
    ? isTest ? 'The checkout experience was completed successfully. No real payment was taken.' : 'Your payment has been confirmed and your order is now recorded.'
    : review ? 'Your payment needs to be reviewed before the order can progress.'
      : failed ? 'Nothing was charged. Your cart remains available so you can try again.'
        : 'We’re confirming the result of your checkout. This usually takes only a moment.'

  return <>
    <PageMeta title={title} description="Review the status of your Doxa order." />
    <section className={`checkout-result ${paid ? 'success' : failed || review ? 'error' : ''}`}>
      {paid ? <CheckCircle2 className="checkout-result-icon" /> : failed || review ? <XCircle className="checkout-result-icon" /> : <Clock3 className="checkout-result-icon pulse" />}
      <p className="eyebrow">{isTest ? 'Test payment' : 'Order confirmation'}</p>
      <h1>{title}</h1><p>{message}</p>
      {order && <div className="checkout-order-card"><div><span>Order</span><strong>#{order.id}</strong></div><div><span>Status</span><strong>{order.status.replace('_', ' ')}</strong></div><div><span>Total</span><strong>{formatMoney(order.totalCents, order.currency)}</strong></div></div>}
      {isTest && <div className="checkout-test-notice centred"><FlaskConical aria-hidden="true" /><span><strong>Test payment</strong>This is a test payment and will be marked as such.</span></div>}
      {paid && order?.paymentEnvironment === 'live' && <section className="checkout-treasury-instructions" aria-labelledby="checkout-treasury-title"><KeyRound aria-hidden="true" /><div><p className="eyebrow">Digital Treasury</p><h2 id="checkout-treasury-title">How to reveal your Saints</h2><p>Once your cards arrive, you can reveal your Saints in your Digital Treasury. Please wait for the physical cards—the unique codes are printed on them.</p><ol><li>Open your Account.</li><li>Navigate to My Treasury.</li><li>Click the glowing Redeem Cards button.</li><li>Enter this order number.</li><li>Enter the unique codes printed on your physical cards.</li><li>Reveal your Saints!</li></ol></div></section>}
      <div className="checkout-result-actions"><Link className="button primary" to="/account/orders"><ShoppingBag /> View your orders</Link>{paid && !isTest && <Link className="button secondary" to="/account/treasury"><KeyRound /> My Treasury</Link>}{!paid && <Link className="button secondary" to="/cart">Return to cart</Link>}</div>
    </section>
  </>
}

export function CheckoutCancelled() {
  const { user, loading: authLoading } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const orderId = params.get('order') ?? ''
  const [message, setMessage] = useState('Closing checkout…')

  useEffect(() => {
    if (!user || !orderId) return
    let active = true
    void cancelCheckout(orderId).then((result) => {
      if (!active) return
      setMessage(result.paid ? 'This payment had already been confirmed. Check your order history for its final status.' : result.processing ? 'This payment is still processing. Its final status will appear in your order history.' : 'Checkout was cancelled. Your cart has been kept and nothing was charged.')
    }).catch(() => {
      if (active) setMessage('The checkout is no longer open. Your cart has been kept, and nothing was charged by this page.')
    })
    return () => { active = false }
  }, [orderId, user])

  if (authLoading) return <section className="checkout-result"><Clock3 className="checkout-result-icon" /><h1>Checking checkout</h1></section>
  if (!user) return <Navigate to="/account" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <><PageMeta title="Checkout cancelled" description="Return to your retained Doxa cart." /><section className="checkout-result"><XCircle className="checkout-result-icon" /><p className="eyebrow">Checkout</p><h1>Checkout cancelled</h1><p>{message}</p><div className="checkout-result-actions"><Link className="button primary" to="/cart">Return to your cart</Link><Link className="button secondary" to="/shop">Continue shopping</Link></div></section></>
}

function CheckoutProblem({ title, message }: { title: string; message: string }) {
  return <><PageMeta title={title} description={message} /><section className="checkout-result error"><XCircle className="checkout-result-icon" /><h1>{title}</h1><p>{message}</p><div className="checkout-result-actions"><Link className="button primary" to="/cart">Return to cart</Link><Link className="button secondary" to="/account/orders">View orders</Link></div></section></>
}
