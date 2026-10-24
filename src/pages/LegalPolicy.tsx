import { ArrowLeft, FileCheck2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import {
  getPublishedLegalPolicy,
  legalPolicyPath,
  type LegalPolicySlug,
} from "../legal/policies";
import "./legalPolicy.css";

export function LegalPolicyPage({ slug }: { slug: LegalPolicySlug }) {
  const policy = getPublishedLegalPolicy(slug);

  if (!policy) {
    return (
      <article className="legal-policy-shell legal-policy-unavailable" aria-labelledby="legal-policy-title">
        <PageMeta
          title="Policy unavailable"
          description="This policy has not yet been approved for publication."
          canonicalPath={legalPolicyPath(slug)}
          noIndex
        />
        <FileCheck2 aria-hidden="true" />
        <p className="eyebrow">Legal information</p>
        <h1 id="legal-policy-title">This policy is not published.</h1>
        <p>
          Doxa has not recorded approved wording for this policy. Please contact
          the team if you need information before placing an order or creating
          an account.
        </p>
        <div className="button-row">
          <Link className="button primary" to="/contact">
            Contact Doxa
          </Link>
          <Link className="text-link" to="/">
            <ArrowLeft aria-hidden="true" /> Return home
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="legal-policy-shell" aria-labelledby="legal-policy-title">
      <PageMeta
        title={policy.title}
        description={policy.description}
        canonicalPath={legalPolicyPath(policy.slug)}
      />
      <header className="legal-policy-header">
        <p className="eyebrow">Legal information</p>
        <h1 id="legal-policy-title">{policy.title}</h1>
        <p>{policy.description}</p>
        <dl className="legal-policy-metadata" aria-label="Policy version">
          <div>
            <dt>Effective</dt>
            <dd>
              <time dateTime={policy.effectiveDate}>{policy.effectiveDate}</time>
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{policy.version}</dd>
          </div>
        </dl>
      </header>

      <div className="legal-policy-content">
        {policy.sections.map((section) => (
          <section key={section.heading} aria-labelledby={`policy-${slug}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <h2 id={`policy-${slug}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="legal-policy-footer">
        <p>
          Questions about this policy? <Link to="/contact">Contact Doxa</Link>.
        </p>
      </footer>
    </article>
  );
}
