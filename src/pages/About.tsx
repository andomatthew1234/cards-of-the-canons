import { BookOpen, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { Reveal } from '../components/Reveal'
import { SafeRichText } from '../components/SafeRichText'
import { useSiteContent } from '../context/SiteContentContext'

export function About({ previewMode = false }: { previewMode?: boolean }) {
  const { pages,website } = useSiteContent()
  const about = pages.about
  const managed = website.pages.about
  return <>
    {!previewMode && <PageMeta title={managed.seo.title} description={managed.seo.description} image={managed.seo.socialImageUrl || undefined} />}
    <header className="page-hero about-hero heritage-page-hero immersive-about-hero" data-editor-target={previewMode ? 'about-introduction' : undefined}>
      <img className="heritage-page-hero-image" data-editor-target={previewMode ? 'about-image' : undefined} src={about.imageUrl ?? '/images/history/hosios-loukas.jpg'} alt={about.imageAlt ?? 'The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia, Greece'} width="1280" height="813" fetchPriority="high" decoding="async" />
      <div className="heritage-page-hero-shade" aria-hidden="true" />
      <div className="page-hero-copy"><p className="eyebrow about-enter about-enter-1">{about.eyebrow}</p><h1 className="about-enter about-enter-2" data-editor-target={previewMode ? 'about-heading' : undefined}>{about.title}</h1>{managed.image?.imageCredit && <p className="photo-credit about-enter about-enter-3">{managed.image.imageCredit}</p>}</div>
    </header>
    <section className="prose-layout" data-editor-target={previewMode ? 'about-content' : undefined}>
      <div className="prose-main about-story-enter">
        <h2>{managed.sections.story.firstHeading}</h2>
        <SafeRichText value={about.body.replace(/\bchurch\b/g, 'Church')} />
        <SafeRichText value={managed.sections.story.secondBody.replace(/\bchurch\b/g, 'Church')} />
        <blockquote>{managed.sections.story.quote}</blockquote>
        <h2>{managed.sections.story.secondHeading}</h2>
        <SafeRichText value={managed.sections.story.thirdBody} />
      </div>
      <aside className="prose-aside about-explore-enter"><p className="eyebrow">{managed.sections.explore.eyebrow}</p><ul>{managed.sections.explore.items.map((item) => <li key={item}>{item}</li>)}</ul><Link className="button secondary" to="/shop">{managed.sections.explore.actionLabel}</Link></aside>
    </section>
    <section className="about-discovery" aria-labelledby="about-discovery-title">
      <Reveal className="about-discovery-heading"><p className="eyebrow">Follow the journey</p><h2 id="about-discovery-title">From the Doxa Journal.</h2><p>Read progress updates, studio notes and longer stories from behind the collection.</p></Reveal>
      <div className="about-discovery-grid">
        <Reveal className="about-feature about-feature-journal" id="journal"><BookOpen aria-hidden="true" /><p className="eyebrow">Journal & progress</p><h3>Behind the collection</h3><p>Follow progress updates, studio notes and longer stories from behind the Doxa Treasury.</p><Link className="text-link" to="/journal">Read the Journal <span aria-hidden="true">→</span></Link></Reveal>
      </div>
    </section>
    <section className="about-faq" aria-labelledby="about-faq-title">
      <Reveal className="about-faq-heading"><HelpCircle aria-hidden="true" /><p className="eyebrow">Frequently asked questions</p><h2 id="about-faq-title">A few helpful answers.</h2></Reveal>
      <div className="about-faq-list">
        <details><summary>What is Doxa Treasury?<span aria-hidden="true">+</span></summary><p>Doxa Treasury is a collectible-card project created to share remarkable people, places and moments from the history of the Church in an approachable format.</p></details>
        <details><summary>Where can I follow new releases and progress?<span aria-hidden="true">+</span></summary><p>You can join the Doxa newsletter from your account. Progress updates will also be published here as the collection develops.</p></details>
        <details><summary>Can I ask about an order or request a quote?<span aria-hidden="true">+</span></summary><p>Yes. Use the Contact page to send a general enquiry or quote request directly to the Doxa team.</p></details>
      </div>
    </section>
  </>
}
