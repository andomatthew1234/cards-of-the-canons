import {
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { ProductCard } from "../components/ProductCard";
import { checkoutMode, formatMoney } from "../config";
import { useCart } from "../context/CartContext";
import { useCatalogState } from "../context/CatalogContext";
import { useSiteContent } from "../context/SiteContentContext";
import { trackEvent } from "../lib/analytics";
import {
  breadcrumbJsonLd,
  categorySlug,
  productJsonLd,
  productsMayBeIndexed,
} from "../lib/seo";

export function ProductDetail() {
  const { slug } = useParams();
  const { products, status, reload } = useCatalogState();
  const product = products.find((item) => item.slug === slug);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const { website } = useSiteContent();
  const copy = website.copy.product;
  const maxQuantity =
    product?.stock === null || product?.stock === undefined
      ? 20
      : Math.min(20, product.stock);
  const canPurchase = Boolean(
    product && product.priceCents > 0 && maxQuantity > 0,
  );

  useEffect(() => {
    if (product) trackEvent("view_product", { item_id: product.id });
  }, [product]);
  useEffect(() => {
    setQuantity((current) =>
      Math.max(1, Math.min(current, Math.max(1, maxQuantity))),
    );
  }, [maxQuantity]);

  if (status === "loading")
    return (
      <section className="empty-state" role="status" aria-live="polite">
        <PageMeta
          title="Loading product"
          description="Loading the requested product."
          noIndex
        />
        <span className="catalogue-loader">
          <ShoppingBag aria-hidden="true" />
        </span>
        <h1>Loading this product</h1>
        <p>Gathering the latest availability…</p>
      </section>
    );
  if (status === "error")
    return (
      <section className="empty-state">
        <PageMeta
          title="Collection unavailable"
          description="The collection is temporarily unavailable."
          noIndex
        />
        <h1>The collection is temporarily unavailable</h1>
        <p>We could not load this product right now.</p>
        <button type="button" className="button primary" onClick={reload}>
          Try again
        </button>
      </section>
    );
  if (!product)
    return (
      <section className="empty-state">
        <PageMeta
          title="Product not found"
          description="The requested product could not be found."
          noIndex
        />
        <h1>Product not found</h1>
        <p>This product may have moved or may no longer be available.</p>
        <Link className="button primary" to="/shop">
          Return to shop
        </Link>
      </section>
    );

  function addToCart() {
    if (!canPurchase) return;
    add(product!.id, Math.min(quantity, maxQuantity));
    setAdded(true);
  }
  const categoryPath = `/shop/category/${categorySlug(product.category)}`;
  const related = products
    .filter(
      (item) => item.id !== product.id && item.category === product.category,
    )
    .slice(0, 3);
  const availability =
    product.stock === null
      ? "Availability is not available yet"
      : product.stock > 0
        ? "Available"
        : "Currently unavailable";

  return (
    <>
      <PageMeta
        title={product.name}
        description={product.shortDescription}
        canonicalPath={`/product/${product.slug}`}
        image={product.imageUrl}
        type="product"
        noIndex={!productsMayBeIndexed()}
        jsonLd={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" },
            { name: product.category, path: categoryPath },
            { name: product.name, path: `/product/${product.slug}` },
          ]),
          productJsonLd(product),
        ]}
      />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to="/shop">Shop</Link>
        <span aria-hidden="true">/</span>
        <Link to={categoryPath}>{product.category}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>
      <section className="product-detail">
        <div className="detail-image">
          <img
            src={product.imageUrl}
            alt={product.imageAlt}
            width="800"
            height="920"
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="price">
            {product.priceCents > 0
              ? formatMoney(product.priceCents)
              : "Price unavailable"}
          </p>
          <p className="lead">{product.shortDescription}</p>
          <p>{product.description}</p>
          <div className={`detail-purchase ${added ? "added" : ""}`}>
            <div className="purchase-row">
              <div className="quantity" aria-label="Quantity">
                <button
                  type="button"
                  disabled={!canPurchase || quantity <= 1}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease quantity"
                >
                  <Minus />
                </button>
                <output aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  disabled={!canPurchase || quantity >= maxQuantity}
                  onClick={() =>
                    setQuantity(Math.min(maxQuantity, quantity + 1))
                  }
                  aria-label="Increase quantity"
                >
                  <Plus />
                </button>
              </div>
              <button
                type="button"
                className="button primary grow detail-add-button"
                disabled={!canPurchase}
                onClick={addToCart}
              >
                <ShoppingBag />{" "}
                {!canPurchase
                  ? product.stock === 0
                    ? "Currently unavailable"
                    : "Not available"
                  : added
                    ? copy.addAnotherLabel
                    : copy.addLabel}
              </button>
            </div>
            {added && (
              <div className="detail-cart-success" role="status">
                <span>
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>{copy.addedTitle}</strong>
                    <small>{copy.addedBody}</small>
                  </span>
                </span>
                <Link to="/cart">
                  {copy.goToCartLabel} <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
          <dl className="product-facts">
            <div>
              <dt>{copy.formatLabel}</dt>
              <dd>{copy.formatValue}</dd>
            </div>
            <div>
              <dt>{copy.availabilityLabel}</dt>
              <dd>{availability}</dd>
            </div>
            <div>
              <dt>{copy.shippingLabel}</dt>
              <dd>
                {checkoutMode === "live"
                  ? "Calculated at checkout"
                  : "Shipping information is not available yet"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      {related.length > 0 && (
        <section className="section related-products">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.relatedEyebrow}</p>
              <h2>
                {copy.relatedTitleTemplate.replace(
                  "{category}",
                  product.category,
                )}
              </h2>
            </div>
            <Link className="text-link" to={categoryPath}>
              {copy.relatedActionLabel}
            </Link>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
