import { Compass, Home as HomeIcon, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { useSiteContent } from "../context/SiteContentContext";

export function NotFound() {
  const { website } = useSiteContent();
  const copy = website.copy.notFound;
  return (
    <section className="not-found-page">
      <PageMeta title={copy.title} description={copy.body} noIndex />
      <div className="not-found-mark" aria-hidden="true">
        <Compass />
      </div>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <div className="button-row">
        <Link className="button primary" to="/">
          <HomeIcon /> {copy.homeLabel}
        </Link>
        <Link className="button secondary" to="/shop">
          <ShoppingBag /> {copy.shopLabel}
        </Link>
      </div>
    </section>
  );
}
