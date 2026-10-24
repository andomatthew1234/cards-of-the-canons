import { ArrowRight, LockKeyhole, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { checkoutEnabled, checkoutMode, formatMoney } from "../config";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSiteContent } from "../context/SiteContentContext";
import { trackEvent } from "../lib/analytics";
import { startCheckout } from "../lib/data";

function checkoutError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code.endsWith("/unauthenticated"))
    return "Sign in before starting checkout.";
  if (code.endsWith("/failed-precondition"))
    return error instanceof Error
      ? error.message.replace(/^FirebaseError:\s*/i, "")
      : "One or more items are not currently available.";
  if (code.endsWith("/resource-exhausted"))
    return "Too many checkout attempts were made. Please wait and try again.";
  if (code.endsWith("/invalid-argument"))
    return "Please review the items and quantities in your cart.";
  return "The secure checkout could not be started. Nothing has been charged; please try again.";
}

export function Cart() {
  const { lines, products, subtotal, update, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { website } = useSiteContent();
  const copy = website.copy.cart;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    if (!user) {
      navigate("/account", { state: { from: "/cart" } });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await startCheckout(lines);
      trackEvent("begin_checkout", { value: subtotal / 100, currency: "AUD" });
      window.location.assign(result.url);
    } catch (checkoutFailure) {
      setError(checkoutError(checkoutFailure));
      setBusy(false);
    }
  }

  if (!lines.length)
    return (
      <>
        <PageMeta title={copy.seoTitle} description={copy.emptyBody} />
        <section className="empty-state">
          <span className="empty-icon">D</span>
          <h1>{copy.emptyTitle}</h1>
          <p>{copy.emptyBody}</p>
          <Link className="button primary" to="/shop">
            {copy.browseLabel}
          </Link>
        </section>
      </>
    );

  return (
    <>
      <PageMeta
        title={copy.seoTitle}
        description="Review quantities and continue to secure Stripe Checkout."
      />
      <header className="page-hero compact">
        <p className="eyebrow">{copy.heroEyebrow}</p>
        <h1>{copy.heroTitle}</h1>
      </header>
      <section className="cart-layout">
        <div className="cart-lines">
          {lines.map((line) => {
            const product = products.find((item) => item.id === line.productId);
            if (!product) return null;
            const maxQuantity =
              product.stock === null ? 20 : Math.min(20, product.stock);
            return (
              <article className="cart-line" key={line.productId}>
                <img src={product.imageUrl} alt="" />
                <div className="cart-line-main">
                  <p className="eyebrow">{product.category}</p>
                  <h2>
                    <Link to={`/product/${product.slug}`}>{product.name}</Link>
                  </h2>
                  <p>
                    {formatMoney(product.priceCents)} {copy.eachLabel}
                  </p>
                  <div className="quantity small">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => update(line.productId, line.quantity - 1)}
                      aria-label={`Decrease ${product.name} quantity`}
                    >
                      <Minus />
                    </button>
                    <output>{line.quantity}</output>
                    <button
                      type="button"
                      disabled={
                        busy || line.quantity >= maxQuantity || maxQuantity < 1
                      }
                      onClick={() => update(line.productId, line.quantity + 1)}
                      aria-label={`Increase ${product.name} quantity`}
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
                <div className="line-end">
                  <strong>
                    {formatMoney(product.priceCents * line.quantity)}
                  </strong>
                  <button
                    type="button"
                    className="remove"
                    disabled={busy}
                    onClick={() => remove(line.productId)}
                  >
                    <Trash2 /> {copy.removeLabel}
                  </button>
                </div>
              </article>
            );
          })}
          <button
            className="text-button danger"
            disabled={busy}
            onClick={clear}
          >
            {copy.clearLabel}
          </button>
        </div>
        <aside className="order-summary">
          <h2>{copy.summaryTitle}</h2>
          <div>
            <span>{copy.subtotalLabel}</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <div>
            <span>{copy.shippingLabel}</span>
            <span>
              {checkoutMode === "live"
                ? "Calculated at checkout"
                : "Not available yet"}
            </span>
          </div>
          <hr />
          <div className="total">
            <span>{copy.totalLabel}</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary grow"
            onClick={() => void checkout()}
            disabled={busy || !checkoutEnabled}
          >
            {busy ? (
              "Preparing secure checkout…"
            ) : !checkoutEnabled ? (
              "Checkout is not available yet"
            ) : user ? (
              <>
                Continue to checkout <ArrowRight />
              </>
            ) : (
              <>
                Sign in to checkout <ArrowRight />
              </>
            )}
          </button>
          {checkoutMode === "test" && (
            <p className="checkout-test-copy">
              This is a test payment and will be marked as such.
            </p>
          )}
          <p className="checkout-security-note">
            <LockKeyhole aria-hidden="true" /> Payment details are entered only
            on Stripe’s secure hosted page.
          </p>
        </aside>
      </section>
    </>
  );
}
