import type { Article, Order, Product } from '../types'
import { replaceLegacyBrand } from '../lib/brand'

export const demoProducts: Product[] = [
  {
    id: 'demo-councils-pack', slug: 'individual-card-pack', name: 'Individual Card Pack',
    shortDescription: 'One randomly selected Doxa card in every pack.',
    description: 'Open one individually packed Doxa card, selected at random from the collection. Each pack contains one card only; the card inside cannot be chosen in advance.',
    priceCents: 1200, currency: 'AUD', imageUrl: '/images/individual-card-pack.svg', imageAlt: 'An individual Doxa card pack',
    category: 'Card packs', featured: true, stock: null, status: 'published',
  },
  {
    id: 'demo-card-bundle', slug: 'card-bundle', name: 'Card Bundle',
    shortDescription: 'Eight individually packed cards for beginning or building a collection.',
    description: 'A bundle of eight individually packed Doxa cards. Final pricing and availability will be announced before release.',
    priceCents: 0, currency: 'AUD', imageUrl: '/images/products/card-bundle.svg', imageAlt: 'Doxa eight-pack card bundle',
    category: 'Card packs', featured: true, stock: 0, status: 'published',
  },
  {
    id: 'demo-collectors-box', slug: 'collectors-box', name: "Collector's Box",
    shortDescription: 'Sixteen card packs presented together for collectors.',
    description: 'A collector-focused box containing sixteen Doxa card packs. Final pricing and availability will be announced before release.',
    priceCents: 0, currency: 'AUD', imageUrl: '/images/products/collectors-box.svg', imageAlt: 'Doxa sixteen-pack collector box',
    category: 'Card packs', featured: true, stock: 0, status: 'published',
  },
  {
    id: 'demo-reformers-set', slug: 'twelve-card-demo-pack', name: '12-Card Demo Pack',
    shortDescription: 'The complete 12-card set, with every card clearly marked DEMO.',
    description: 'Explore the complete 12-card set in one demonstration pack. Every card is visibly stamped DEMO and is intended for preview, display and familiarisation rather than as a standard collecting card.',
    priceCents: 2400, currency: 'AUD', imageUrl: '/images/twelve-card-demo-pack.svg', imageAlt: 'Twelve-card demonstration pack with a clearly visible DEMO stamp',
    category: 'Card packs', featured: true, stock: null, status: 'published',
  },
  {
    id: 'demo-church-fathers', slug: 'card-collecting-binder', name: 'Card Collecting Binder',
    shortDescription: 'A dedicated folder for arranging and protecting a growing collection.',
    description: 'Keep Doxa cards ordered in a dedicated collecting binder. Its purpose is simple: a considered home for arranging, revisiting and protecting your collection as it grows.',
    priceCents: 3200, currency: 'AUD', imageUrl: '/images/card-collecting-binder.svg', imageAlt: 'Doxa collecting binder',
    category: 'Collecting accessories', featured: true, stock: null, status: 'published',
  },
  {
    id: 'demo-doxa-t-shirt', slug: 'doxa-t-shirt', name: 'Doxa T-Shirt',
    shortDescription: 'A simple Doxa shirt for the collection beyond the cards.',
    description: 'A Doxa T-shirt in development. Final sizing, pricing and availability will be announced before release.',
    priceCents: 0, currency: 'AUD', imageUrl: '/images/products/doxa-t-shirt.svg', imageAlt: 'Doxa T-shirt concept',
    category: 'Apparel', featured: false, stock: 0, status: 'published',
  },
  {
    id: 'demo-doxa-cap', slug: 'doxa-cap', name: 'Doxa Cap',
    shortDescription: 'A considered cap carrying the Doxa monogram.',
    description: 'A Doxa cap in development. Final sizing, pricing and availability will be announced before release.',
    priceCents: 0, currency: 'AUD', imageUrl: '/images/products/doxa-cap.svg', imageAlt: 'Doxa cap concept',
    category: 'Apparel', featured: false, stock: 0, status: 'published',
  },
  {
    id: 'demo-timeline', slug: 'church-history-bookmarks', name: 'Church History Bookmarks',
    shortDescription: 'Thoughtful bookmarks for the reader, collector and student of history.',
    description: 'A set of Doxa bookmarks designed to accompany unhurried reading. They bring the collection’s warm, historical character to the books and notes you return to most.',
    priceCents: 1800, currency: 'AUD', imageUrl: '/images/church-history-bookmarks.svg', imageAlt: 'Doxa Church history bookmarks',
    category: 'Bookmarks', featured: false, stock: null, status: 'published',
  },
  {
    id: 'demo-future-merchandise', slug: 'future-merchandise', name: 'Other Merchandise',
    shortDescription: 'Future Doxa merchandise is being considered.',
    description: 'Further merchandise is being considered for the collection. This draft is intentionally not available to purchase while the range and specifications are being decided.',
    priceCents: 0, currency: 'AUD', imageUrl: '/images/fathers.svg', imageAlt: 'Doxa merchandise coming soon',
    category: 'Merchandise', featured: false, stock: null, status: 'draft',
  },
]

export function normaliseProductCopy(product: Product): Product {
  return {
    ...product,
    name: replaceLegacyBrand(product.name),
    shortDescription: replaceLegacyBrand(product.shortDescription),
    description: replaceLegacyBrand(product.description),
    imageAlt: replaceLegacyBrand(product.imageAlt),
  }
}

export const demoOrders: Order[] = []

export const demoJournalArticles: Article[] = [
  {
    id: 'starter-building-doxa', revision: 0, slug: 'building-the-doxa-treasury', title: 'Building the Doxa Treasury',
    excerpt: 'A first look at the ideas shaping Doxa: beautiful objects, carefully told stories and a collection designed to be revisited.',
    category: 'Progress update', coverImageUrl: '/images/history/hosios-loukas.jpg',
    coverImageAlt: 'The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia', authorName: 'Doxa Treasury',
    seoTitle: '', seoDescription: '', featured: true, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z',
    bodyMarkdown: 'Doxa began with a simple hope: to make the beauty and history of the Church easier to encounter, hold and share. The collection is being shaped around stories worth returning to, with artwork and physical details that invite a closer look.\n\nWe are currently refining the first cards, their presentation and the wider collecting experience. That work includes the Treasury, where collectors will be able to record the cards they own and see their collection grow over time.\n\nThis Journal will hold progress notes, stories behind the collection and longer explorations of the people, places and moments that inspire Doxa. More will be shared as the first release takes shape.',
  },
  {
    id: 'starter-history-hands', revision: 0, slug: 'why-history-belongs-in-your-hands', title: 'Why history belongs in your hands',
    excerpt: 'The thinking behind a tactile collection—and why a physical object can make a story feel newly present.',
    category: 'From the studio', coverImageUrl: '/images/editorial/doxa-candle-vigil.webp',
    coverImageAlt: 'Beeswax prayer candles glowing inside an Orthodox Church', authorName: 'Doxa Treasury',
    seoTitle: '', seoDescription: '', featured: false, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z',
    bodyMarkdown: 'History can feel distant when it is reduced to dates on a page. A thoughtfully made card creates a different kind of encounter: an image to study, a story to remember and an object that can be shared with somebody else.\n\nThat is why Doxa is being designed as more than a checklist. Each card belongs to a wider treasury of people, places and turning points, with room for a collector to make connections across the life of the Church.\n\nThe physical collection and the online Treasury are intended to work together. The card remains the heart of the experience; the account simply helps collectors recognise what they hold and discover what remains.',
  },
]
