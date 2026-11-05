import { ArrowLeft, FileCheck2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { PageMeta } from "../components/PageMeta";
import { getPublishedTermsPolicy } from "../lib/data";
import { APPROVED_TERMS_POLICY } from "../legal/approvedTerms";
import type { TermsPolicyDocument } from "../types";
import {
  getPublishedLegalPolicy,
  legalPolicyPath,
  type LegalPolicySlug,
} from "../legal/policies";
import "./legalPolicy.css";

export function LegalPolicyPage({ slug }: { slug: LegalPolicySlug }) {
  const [termsPolicy, setTermsPolicy] = useState<TermsPolicyDocument | null | undefined>(undefined);

  useEffect(() => {
    if (slug !== "terms") return;
    let active = true;
    setTermsPolicy(undefined);
    void getPublishedTermsPolicy()
      .then((policy) => {
        if (active) setTermsPolicy(policy ?? APPROVED_TERMS_POLICY);
      })
      .catch(() => {
        if (active) setTermsPolicy(APPROVED_TERMS_POLICY);
      });
    return () => { active = false; };
  }, [slug]);

  if (slug === "terms" && termsPolicy === undefined) {
    return (
      <article className="legal-policy-shell legal-policy-loading" aria-busy="true" aria-live="polite">
        <PageMeta title="Terms and Conditions" description="Doxa Terms and Conditions." canonicalPath={legalPolicyPath(slug)} noIndex />
        <p>Loading Terms and Conditions…</p>
      </article>
    );
  }

  if (slug === "terms" && termsPolicy) {
    return (
      <article className="legal-policy-shell" aria-labelledby="legal-policy-title">
        <PageMeta title={termsPolicy.title} description={termsPolicy.description} canonicalPath={legalPolicyPath(slug)} />
        <header className="legal-policy-header">
          <p className="eyebrow">Legal information</p>
          <h1 id="legal-policy-title">{termsPolicy.title}</h1>
          <p>{termsPolicy.description}</p>
          <dl className="legal-policy-metadata" aria-label="Policy version">
            <div><dt>Effective</dt><dd><time dateTime={termsPolicy.effectiveDate}>{termsPolicy.effectiveDate}</time></dd></div>
            <div><dt>Version</dt><dd>{termsPolicy.version}</dd></div>
          </dl>
        </header>
        <MarkdownContent markdown={termsPolicy.bodyMarkdown} className="legal-policy-content" />
        <footer className="legal-policy-footer"><p>Questions about this policy? <Link to="/contact">Contact Doxa</Link>.</p></footer>
      </article>
    );
  }

  const policy = slug === "terms" ? null : getPublishedLegalPolicy(slug);

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
