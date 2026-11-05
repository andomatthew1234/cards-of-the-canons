import { z } from "zod";

const text = (maximum: number, minimum = 0) =>
  z.string().trim().min(minimum).max(maximum);
const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      /^\/images\/[A-Za-z0-9._/-]+$/.test(value) ||
      /^https:\/\/firebasestorage\.googleapis\.com\/[A-Za-z0-9?&=._~%/-]+$/.test(
        value,
      ),
    "Use an approved website image.",
  );
const optionalImageUrl = z.union([z.literal(""), imageUrl]);
const editorialPanel = z
  .object({
    title: text(160, 2),
    body: text(2_000),
    imageUrl: optionalImageUrl,
    imageAlt: text(200),
  })
  .strict()
  .superRefine((panel, context) => {
    if (panel.imageUrl && !panel.imageAlt.trim())
      context.addIssue({
        code: "custom",
        path: ["imageAlt"],
        message: "Describe the panel image.",
      });
  });
const councilEditorialPanel = z
  .object({
    title: text(160, 2),
    body: text(2_000),
    imageUrl: optionalImageUrl,
    imageAlt: text(200),
    quoteReference: text(120),
    quote: text(1_000),
  })
  .strict()
  .superRefine((panel, context) => {
    if (panel.imageUrl && !panel.imageAlt.trim())
      context.addIssue({
        code: "custom",
        path: ["imageAlt"],
        message: "Describe the panel image.",
      });
  });
const genesisEditorialPanel = z
  .object({
    title: text(160, 2),
    body: text(2_000),
    imageUrl: optionalImageUrl,
    imageAlt: text(200),
    quoteReference: text(120).default(""),
    quote: text(1_000).default(""),
  })
  .strict()
  .superRefine((panel, context) => {
    if (panel.imageUrl && !panel.imageAlt.trim())
      context.addIssue({
        code: "custom",
        path: ["imageAlt"],
        message: "Describe the How It Began image.",
      });
  });
function isSafeWebsiteDestination(value: string) {
  if (/^\/(?!\/)(?:[A-Za-z0-9][A-Za-z0-9/_-]*)?(?:#[A-Za-z][A-Za-z0-9_-]*)?$/.test(value))
    return true;
  if (!value.startsWith("https://") || /[\u0000-\u001f\u007f\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const websiteDestination = z
  .string()
  .trim()
  .max(2048)
  .refine(isSafeWebsiteDestination, "Use a website path or a secure https:// address.");
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const imageSchema = z
  .object({
    imageUrl,
    imageAlt: text(200, 2),
    imageCredit: text(240),
  })
  .strict();

export const homeSectionsSchema = z
  .object({
    hero: z
      .object({
        accent: text(80),
        imageUrl,
        imageAlt: text(200, 2),
        backImageUrl: optionalImageUrl.optional(),
        backImageAlt: text(200).optional(),
        imageCredit: text(240),
        primaryActionLabel: text(60, 2),
        secondaryActionLabel: text(60, 2),
      })
      .strict()
      .superRefine((hero, context) => {
        if (hero.backImageUrl && !hero.backImageAlt?.trim())
          context.addIssue({
            code: "custom",
            path: ["backImageAlt"],
            message: "Describe the display card back image.",
          });
      }),
    values: z
      .object({
        firstTitle: text(80, 2),
        firstBody: text(160, 2),
        secondTitle: text(80, 2),
        secondBody: text(160, 2),
        thirdTitle: text(80, 2),
        thirdBody: text(160, 2),
        marquee: text(320, 2),
        bubbles: z
          .array(
            z
              .object({
                id: text(64, 2),
                title: text(80, 2),
                    body: text(600),
                imageUrl: optionalImageUrl,
                imageAlt: text(200),
              })
              .strict()
              .superRefine((bubble, context) => {
                if (bubble.imageUrl && !bubble.imageAlt.trim())
                  context.addIssue({
                    code: "custom",
                    path: ["imageAlt"],
                    message: "Describe the information bubble background image.",
                  });
              }),
          )
          .min(1)
          .max(12)
          .optional(),
      })
      .strict(),
    featured: z
      .object({
        // The collection remains useful without introductory copy.
        eyebrow: text(80),
        title: text(160),
        body: text(1000),
      })
      .strict(),
    story: z
      .object({
        eyebrow: text(80, 2),
        title: text(160, 2),
        body: text(3000, 2),
        imageUrl,
        imageAlt: text(200, 2),
        imageCredit: text(240),
        actionLabel: text(60, 2),
      })
      .strict(),
    newsletter: z
      .object({
        eyebrow: text(80, 2),
        title: text(160, 2),
        body: text(1000, 2),
      })
      .strict(),
    editorial: z
      .object({
        council: councilEditorialPanel,
        genesis: genesisEditorialPanel,
        scriptorium: editorialPanel,
      })
      .strict()
      .optional(),
  })
  .strict();

export const homeSectionIds = [
  "hero",
  "values",
  "featured",
  "story",
  "newsletter",
] as const;
const homeSectionId = z.enum(homeSectionIds);
const pageSeoSchema = z
  .object({
    title: text(120, 2),
    description: text(320, 2),
    socialImageUrl: optionalImageUrl,
  })
  .strict();

const standardPageSchema = z
  .object({
    eyebrow: text(80),
    title: text(160, 2),
    body: text(10_000, 2),
    image: imageSchema.optional(),
    seo: pageSeoSchema,
  })
  .strict();

const aboutPageSchema = standardPageSchema
  .extend({
    sections: z
      .object({
        story: z
          .object({
            firstHeading: text(160, 2),
            secondBody: text(3000, 2),
            quote: text(500, 2),
            secondHeading: text(160, 2),
            thirdBody: text(3000, 2),
          })
          .strict(),
        explore: z
          .object({
            eyebrow: text(80, 2),
            items: z.array(text(240, 2)).min(1).max(8),
            actionLabel: text(60, 2),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const shopPageSchema = standardPageSchema
  .extend({
    // Shop introduction copy is optional: product browsing remains useful on its own.
    eyebrow: text(80),
    title: text(160),
    body: text(10000),
    categoryTitleTemplate: text(160, 2).refine(
      (value) => value.includes("{category}"),
      "Include {category} in the category title template.",
    ),
    categoryBodyTemplate: text(500, 2).refine(
      (value) => value.includes("{category}"),
      "Include {category} in the category description template.",
    ),
  })
  .strict();

const contactPageSchema = standardPageSchema
  .extend({
    sections: z
      .object({
        tabs: z
          .object({ enquiryLabel: text(80, 2), directLabel: text(80, 2) })
          .strict(),
        enquiry: z
          .object({
            openLabel: text(80, 2),
            quotePromptTitle: text(120, 2),
            quotePromptBody: text(600, 2),
            processEyebrow: text(80, 2),
            processTitle: text(160, 2),
            processBody: text(600, 2),
            steps: z
              .array(
                z.object({ title: text(160, 2), body: text(600, 2) }).strict(),
              )
              .length(3),
          })
          .strict(),
        direct: z
          .object({
            eyebrow: text(80, 2),
            title: text(160, 2),
            body: text(1000, 2),
            detailsEyebrow: text(80, 2),
            repliesLabel: text(80, 2),
            repliesValue: text(240, 2),
            tipTitle: text(160, 2),
            tipBody: text(600, 2),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const paletteSchema = z
  .object({
    ink: colour,
    brown: colour,
    brownAccent: colour,
    gold: colour,
    goldLight: colour,
    paper: colour,
    cream: colour,
    line: colour,
    surface: colour,
    muted: colour,
    success: colour,
    danger: colour,
  })
  .strict();

const linkSchema = z
  .object({
    id: text(40, 1).regex(/^[a-z][a-z0-9_-]*$/),
    label: text(60, 1),
    path: websiteDestination,
    visible: z.boolean(),
  })
  .strict();
const footerGroupSchema = z
  .object({
    id: text(40, 1).regex(/^[a-z][a-z0-9_-]*$/),
    heading: text(60, 1),
    links: z.array(linkSchema).max(8),
  })
  .strict();

export const websiteContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    copy: z
      .object({
        cartLabel: text(40, 1),
        accountLabel: text(40, 1),
        administratorLabel: text(40, 1),
        homeScrollLabel: text(60, 2),
        homeViewAllLabel: text(60, 2),
        newsletter: z
          .object({
            eyebrow: text(80, 2),
            title: text(160, 2),
            body: text(1000, 2),
            emailPlaceholder: text(120, 2),
            consentLabel: text(500, 2),
          })
          .strict(),
        product: z
          .object({
            formatLabel: text(60, 2),
            formatValue: text(120, 2),
            availabilityLabel: text(60, 2),
            shippingLabel: text(60, 2),
            addLabel: text(60, 2),
            addAnotherLabel: text(60, 2),
            addedTitle: text(100, 2),
            addedBody: text(240, 2),
            goToCartLabel: text(60, 2),
            relatedEyebrow: text(80, 2),
            relatedTitleTemplate: text(160, 2).refine(
              (value) => value.includes("{category}"),
              "Include {category} in the related-products title.",
            ),
            relatedActionLabel: text(80, 2),
          })
          .strict(),
        cart: z
          .object({
            seoTitle: text(120, 2),
            heroEyebrow: text(80, 2),
            heroTitle: text(160, 2),
            emptyTitle: text(160, 2),
            emptyBody: text(500, 2),
            browseLabel: text(80, 2),
            eachLabel: text(40, 1),
            removeLabel: text(60, 2),
            clearLabel: text(60, 2),
            summaryTitle: text(120, 2),
            subtotalLabel: text(60, 2),
            shippingLabel: text(60, 2),
            totalLabel: text(60, 2),
          })
          .strict(),
        notFound: z
          .object({
            eyebrow: text(80, 2),
            title: text(160, 2),
            body: text(600, 2),
            homeLabel: text(80, 2),
            shopLabel: text(80, 2),
          })
          .strict(),
      })
      .strict(),
    branding: z
      .object({
        businessName: text(100, 2),
        headerName: text(100, 2),
        footerName: text(100, 2),
        publicContactEmail: z.string().trim().toLowerCase().email().max(160),
        tagline: text(320, 2),
      })
      .strict(),
    header: z
      .object({
        announcementEnabled: z.boolean(),
        announcementText: text(240),
        announcementLinkLabel: text(60),
        announcementLinkPath: websiteDestination,
      })
      .strict(),
    navigation: z
      .object({ primary: z.array(linkSchema).min(1).max(8) })
      .strict(),
    footer: z
      .object({
        description: text(320, 2),
        copyrightText: text(160, 2),
        groups: z.array(footerGroupSchema).min(1).max(4),
      })
      .strict(),
    theme: z
      .object({
        typography: z.enum(["heritage", "classical", "editorial"]),
        palette: paletteSchema,
        logo: z
          .object({
            mode: z.enum(["monogram", "image", "text"]),
            monogram: text(3, 1),
            imageUrl: optionalImageUrl,
            imageAlt: text(120, 1),
          })
          .strict(),
      })
      .strict()
      .superRefine((theme, context) => {
        if (theme.logo.mode === "image" && !theme.logo.imageUrl)
          context.addIssue({
            code: "custom",
            path: ["logo", "imageUrl"],
            message: "An image logo requires an image.",
          });
      }),
    seo: z
      .object({
        siteTitle: text(100, 2),
        titleTemplate: text(140, 2),
        defaultDescription: text(320, 2),
        defaultSocialImageUrl: optionalImageUrl,
      })
      .strict(),
    pages: z
      .object({
        home: z
          .object({
            eyebrow: text(80),
            title: text(160, 2),
            body: text(10_000, 2),
            seo: pageSeoSchema,
            sections: homeSectionsSchema,
            layout: z
              .object({
                order: z.array(homeSectionId).length(homeSectionIds.length),
                visibility: z
                  .object({
                    hero: z.boolean(),
                    values: z.boolean(),
                    featured: z.boolean(),
                    story: z.boolean(),
                    newsletter: z.boolean(),
                  })
                  .strict(),
              })
              .strict(),
          })
          .strict()
          .superRefine((home, context) => {
            if (new Set(home.layout.order).size !== homeSectionIds.length)
              context.addIssue({
                code: "custom",
                path: ["layout", "order"],
                message: "Each home section must appear exactly once.",
              });
          }),
        about: aboutPageSchema,
        shop: shopPageSchema,
        contact: contactPageSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((content, context) => {
    const navIds = content.navigation.primary.map((item) => item.id);
    if (new Set(navIds).size !== navIds.length)
      context.addIssue({
        code: "custom",
        path: ["navigation", "primary"],
        message: "Navigation IDs must be unique.",
      });
    const footerIds = content.footer.groups.map((group) => group.id);
    if (new Set(footerIds).size !== footerIds.length)
      context.addIssue({
        code: "custom",
        path: ["footer", "groups"],
        message: "Footer group IDs must be unique.",
      });
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > 200_000)
      context.addIssue({
        code: "custom",
        message: "Website content is too large.",
      });
  });

export type WebsiteContent = z.infer<typeof websiteContentSchema>;

const defaultInformationBubbles: NonNullable<WebsiteContent["pages"]["home"]["sections"]["values"]["bubbles"]> = [
  { id: "child-safety", title: "Tested for child safety", body: "", imageUrl: "", imageAlt: "" },
  { id: "reverently-produced", title: "Reverently produced", body: "", imageUrl: "", imageAlt: "" },
  { id: "no-ai", title: "No AI", body: "", imageUrl: "", imageAlt: "" },
  { id: "no-artificial-scarcity", title: "No artificial scarcity", body: "", imageUrl: "", imageAlt: "" },
  { id: "made-in-australia", title: "Made in Australia", body: "", imageUrl: "", imageAlt: "" },
];

export const defaultHomepageEditorialPanels: NonNullable<WebsiteContent["pages"]["home"]["sections"]["editorial"]> = {
  council: {
    title: "Join the Council",
    body: "Fill out your digital collection, vote on new releases, give feedback, track your orders, and receive the latest news!",
    quoteReference: "Matthew 18:20",
    quote: "For where two or three are gathered together in My name, I am there in the midst of them.",
    imageUrl: "/images/editorial/join-the-council.webp",
    imageAlt: "Orthodox clergy gathered in a richly decorated church",
  },
  genesis: {
    title: "How It Began",
    body: "DoXa Treasury began at a vespers service in a regional Australian monastery, when a young convert saw Christ’s beauty and felt a deep conviction that it must be shared.\n\nBeauty is more than just something pretty, It shows God’s goodness and points toward the Divine. The love of beauty is called philokalia, and it brings us closer to the source of all beauty, God. And that is our purpose.",
    quoteReference: "Psalm 27:4",
    quote: "One *thing* I have desired of the Lord,\nThat will I seek:\nThat I may dwell in the house of the Lord\nAll the days of my life,\nTo behold the beauty of the Lord,\nAnd to inquire in His temple.",
    imageUrl: "",
    imageAlt: "",
  },
  scriptorium: {
    title: "From the Scriptorium",
    body: "*Knowledge of God is more valuable than anything created. — Saint Maximus the Confessor*\n\nBrowse our library to learn the lives of the saints, Church history, testimonials, and more!",
    imageUrl: "/images/editorial/from-the-scriptorium.webp",
    imageAlt: "An illuminated manuscript and writing desk in a monastic scriptorium",
  },
};

const retiredInformationBubbleSets = [
  [
    ["rich-context", "Rich context", "Designed to encourage learning"],
    ["collectible-format", "Collectible format", "Created for thoughtful discovery"],
    ["considered-detail", "Considered detail", "Made to read, revisit and share"],
  ],
  [
    ["rich-context", "Reverently Crafted", "Designed by a human, under the supervision of a priest."],
    ["collectible-format", "Perfect Equality", "Each card holds the same value, no artificial scarcity."],
    ["considered-detail", "Made in Australia", "Manufactured at home right here in Australia"],
  ],
] as const;

function needsCurrentInformationBubbles(values: WebsiteContent["pages"]["home"]["sections"]["values"]) {
  if (!values.bubbles?.length) return true;
  return retiredInformationBubbleSets.some((retired) => retired.every(([id, title, body], index) => {
    const bubble = values.bubbles?.[index];
    return bubble?.id === id && bubble.title === title && bubble.body === body;
  }));
}

export const defaultWebsiteContent: WebsiteContent = {
  schemaVersion: 1,
  copy: {
    cartLabel: "Cart",
    accountLabel: "Account",
    administratorLabel: "Administrator",
    homeScrollLabel: "Scroll to discover",
    homeViewAllLabel: "View all products",
    newsletter: {
      eyebrow: "From the scriptorium",
      title: "Thoughtful updates, delivered with care.",
      body: "Receive occasional news as new cards, collections and stories become available to explore.",
      emailPlaceholder: "you@example.com",
      consentLabel:
        "I agree to receive occasional updates from Doxa. I can unsubscribe at any time.",
    },
    product: {
      formatLabel: "Format",
      formatValue: "Collectible cards",
      availabilityLabel: "Availability",
      shippingLabel: "Shipping",
      addLabel: "Add to cart",
      addAnotherLabel: "Add another",
      addedTitle: "Added to your cart",
      addedBody: "Your selection is ready when you are.",
      goToCartLabel: "Go to cart",
      relatedEyebrow: "Continue exploring",
      relatedTitleTemplate: "More from {category}",
      relatedActionLabel: "View the collection",
    },
    cart: {
      seoTitle: "Your cart",
      heroEyebrow: "Your cart",
      heroTitle: "Your selection",
      emptyTitle: "Your cart is empty",
      emptyBody: "Browse the collection and add a product to continue.",
      browseLabel: "Browse the collection",
      eachLabel: "each",
      removeLabel: "Remove",
      clearLabel: "Clear cart",
      summaryTitle: "Order summary",
      subtotalLabel: "Subtotal",
      shippingLabel: "Shipping",
      totalLabel: "Total",
    },
    notFound: {
      eyebrow: "Error 404",
      title: "This page has slipped from the archive.",
      body: "The address may have changed, or the page may no longer be part of the collection. Choose a path below to continue exploring.",
      homeLabel: "Return home",
      shopLabel: "Browse the collection",
    },
  },
  branding: {
    businessName: "Doxa",
    headerName: "Doxa Cards",
    footerName: "Doxa",
    publicContactEmail: "info@doxatreasury.com",
    tagline:
      "A considered storefront for collectible stories from Church history.",
  },
  header: {
    announcementEnabled: false,
    announcementText: "",
    announcementLinkLabel: "",
    announcementLinkPath: "/about",
  },
  navigation: {
    primary: [
      { id: "home", label: "Home", path: "/", visible: true },
      { id: "shop", label: "Shop", path: "/shop", visible: true },
      { id: "about", label: "About", path: "/about", visible: true },
      { id: "contact", label: "Contact", path: "/contact", visible: true },
    ],
  },
  footer: {
    description:
      "A considered storefront for collectible stories from Church history.",
    copyrightText: "All rights reserved.",
    groups: [
      {
        id: "explore",
        heading: "Links",
        links: [
          {
            id: "shop",
            label: "Browse the collection",
            path: "/shop",
            visible: true,
          },
          { id: "about", label: "Our purpose", path: "/about", visible: true },
          {
            id: "contact",
            label: "Enquiries & quotes",
            path: "/contact",
            visible: true,
          },
          { id: "account-link", label: "Account", path: "/account", visible: true },
          { id: "journal", label: "Our Journal", path: "/journal", visible: true },
          { id: "links-spare", label: "Spare link", path: "/", visible: false },
        ],
      },
      {
        id: "account",
        heading: "More",
        links: [
          {
            id: "account",
            label: "Account Centre",
            path: "/account",
            visible: true,
          },
          {
            id: "orders",
            label: "Orders & purchases",
            path: "/account/orders",
            visible: true,
          },
          {
            id: "security",
            label: "Security & sign-in",
            path: "/account/security",
            visible: true,
          },
          {
            id: "administrator",
            label: "Administrator",
            path: "/admin",
            visible: true,
          },
          { id: "x", label: "X", path: "https://x.com/", visible: false },
          { id: "more-spare", label: "Spare link", path: "/", visible: false },
        ],
      },
    ],
  },
  theme: {
    typography: "heritage",
    palette: {
      ink: "#1c0f0a",
      brown: "#35190f",
      brownAccent: "#70401d",
      gold: "#8f5a0c",
      goldLight: "#d8b04a",
      paper: "#f3e5ca",
      cream: "#dec69a",
      line: "#b58743",
      surface: "#fcf5de",
      muted: "#5f4a3b",
      success: "#36563e",
      danger: "#7c302b",
    },
    logo: {
      mode: "monogram",
      monogram: "D",
      imageUrl: "",
      imageAlt: "Doxa logo",
    },
  },
  seo: {
    siteTitle: "Doxa",
    titleTemplate: "%s — Doxa",
    defaultDescription:
      "Explore the Doxa collection, inspired by people, places and turning points in Christian history.",
    defaultSocialImageUrl: "/images/history/mount-athos-simonopetra.jpg",
  },
  pages: {
    home: {
      eyebrow: "History worth holding",
      title: "The Glory of the Church",
      body: "Discover the beauty, history and living witness of the Church through stories created to collect, revisit and share.",
      seo: {
        title: "Collectible stories from Church history",
        description:
          "Explore the Doxa collection, inspired by people, places and turning points in Christian history.",
        socialImageUrl: "/images/history/mount-athos-simonopetra.jpg",
      },
      sections: {
        hero: {
          accent: "carefully collected.",
          imageUrl: "/images/history/mount-athos-simonopetra.jpg",
          imageAlt:
            "Simonopetra Monastery rising from the cliffs above the Aegean Sea at Mount Athos",
          backImageUrl: "",
          backImageAlt: "Back of the Doxa display card",
          imageCredit:
            "Simonopetra, Mount Athos · Angelos @ Ottawa · Public domain",
          primaryActionLabel: "Explore the collection",
          secondaryActionLabel: "Discover our purpose",
        },
        values: {
          firstTitle: "Rich context",
          firstBody: "Designed to encourage learning",
          secondTitle: "Collectible format",
          secondBody: "Created for thoughtful discovery",
          thirdTitle: "Considered detail",
          thirdBody: "Made to read, revisit and share",
          marquee:
            "Collectible storytelling · Church history · Thoughtful discovery · Designed to revisit",
          bubbles: structuredClone(defaultInformationBubbles),
        },
        featured: {
          eyebrow: "Featured collection",
          title: "Explore the collection",
          body: "Discover cards and collections that bring remarkable people, moments and ideas from Church history into view.",
        },
        story: {
          eyebrow: "Our mission",
          title: "The Church's Light,\nIs Meant To Be Shared",
          body: "Doxa exists to make the beauty and history of the Church tangible. Through considered artwork and collectible stories, we hope to help people encounter an inheritance that is alive, luminous and worth sharing.",
          imageUrl: "/images/history/byzantine-church-interior.jpg",
          imageAlt:
            "Chandelier and apse mosaic inside a Byzantine Church in Athens",
          imageCredit:
            "Panagia Gorgoepikoos, Athens · George E. Koronaios · CC BY-SA 4.0",
          actionLabel: "Discover our purpose",
        },
        newsletter: {
          eyebrow: "Community",
          title: "Our Socials",
          body: "Follow us on social media for live updates, events, to show support, and share your experiences!",
        },
        editorial: structuredClone(defaultHomepageEditorialPanels),
      },
      layout: {
        order: ["hero", "story", "featured", "values", "newsletter"],
        visibility: {
          hero: true,
          values: true,
          featured: true,
          story: true,
          newsletter: true,
        },
      },
    },
    about: {
      eyebrow: "Our purpose",
      title: "Church history, made to collect and explore.",
      body: "Doxa brings stories from Christian and Church history into an approachable, tactile format.",
      image: {
        imageUrl: "/images/history/hosios-loukas.jpg",
        imageAlt:
          "The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia, Greece",
        imageCredit: "",
      },
      seo: {
        title: "About Doxa",
        description:
          "Discover the purpose behind Doxa and its thoughtful approach to Christian and Church-history collectibles.",
        socialImageUrl: "/images/history/hosios-loukas.jpg",
      },
      sections: {
        story: {
          firstHeading: "History you can hold",
          secondBody:
            "From formative councils and influential thinkers to the places where faith was debated, practised and preserved, each subject opens a doorway into a much larger story.",
          quote:
            "Each card is an invitation to pause, look closer and discover where the story leads.",
          secondHeading: "Made for thoughtful discovery",
          thirdBody:
            "The collection is designed to reward curiosity. Read one card at a time, follow a theme across a set, or use the wider archive to connect people, places and events across the centuries.",
        },
        explore: {
          eyebrow: "Explore the collection",
          items: [
            "Meet people who shaped Christian history",
            "Place important moments in historical context",
            "Follow themes across cards, packs and collections",
            "Return to the stories at your own pace",
          ],
          actionLabel: "Browse the collection",
        },
      },
    },
    shop: {
      eyebrow: "The collection",
      title: "Browse the archive",
      body: "Discover collectible stories inspired by remarkable people, places and turning points from Church history.",
      categoryTitleTemplate: "{category} collection",
      categoryBodyTemplate: "Explore products in the {category} collection.",
      seo: {
        title: "Church-history collectible cards",
        description:
          "Explore the Doxa collection of thoughtfully presented Christian and Church-history collectibles.",
        socialImageUrl: "",
      },
    },
    contact: {
      eyebrow: "Contact",
      title: "Start a conversation.",
      body: "Ask about the collection, request a quote, or reach the Doxa team directly.",
      seo: {
        title: "Contact and quote requests",
        description:
          "Send a general enquiry or quote request to the Doxa team.",
        socialImageUrl: "",
      },
      sections: {
        tabs: {
          enquiryLabel: "Enquiries and quote requests",
          directLabel: "Contact us directly",
        },
        enquiry: {
          openLabel: "Enquiries are open",
          quotePromptTitle: "Requesting a quote?",
          quotePromptBody:
            "Include the products, quantities, destination and timing you have in mind so we can provide a useful response.",
          processEyebrow: "After you send",
          processTitle: "What happens next",
          processBody:
            "We will review your message and reply to the email address you provide.",
          steps: [
            {
              title: "Send your enquiry or quote request",
              body: "Tell us what you’re considering, including any quantities, timing or questions that will help us understand your request.",
            },
            {
              title: "We will review your message",
              body: "General enquiries and detailed quote requests are reviewed before we reply.",
            },
            {
              title: "Receive our reply by email",
              body: "We will reply to the email address you provide, so please check it carefully before submitting the form.",
            },
          ],
        },
        direct: {
          eyebrow: "Direct contact",
          title: "Prefer email? Contact us directly.",
          body: "Use the public email address below if you prefer to compose your message in your own inbox. Your message will reach the same Doxa team.",
          detailsEyebrow: "Contact details",
          repliesLabel: "Replies",
          repliesValue: "Sent directly to your email inbox",
          tipTitle: "To help us provide a useful first response",
          tipBody:
            "Please include the collection or product you are enquiring about, estimated quantities and any important dates.",
        },
      },
    },
  },
};

export function parseWebsiteContent(value: unknown): WebsiteContent {
  return upgradeWebsiteContent(websiteContentSchema.parse(value));
}

const footerLinkUpgrades: Record<string, WebsiteContent["footer"]["groups"][number]["links"]> = {
  explore: [
    { id: "account-link", label: "Account", path: "/account", visible: true },
    { id: "journal", label: "Our Journal", path: "/journal", visible: true },
    { id: "links-spare", label: "Spare link", path: "/", visible: false },
  ],
  account: [
    { id: "x", label: "X", path: "https://x.com/", visible: false },
    { id: "more-spare", label: "Spare link", path: "/", visible: false },
  ],
};

/** Keeps older saved website documents compatible with new editor link slots. */
export function upgradeWebsiteContent(content: WebsiteContent): WebsiteContent {
  const upgraded = structuredClone(content);
  if (upgraded.theme.palette.surface.toLowerCase() === "#fff8e8") {
    upgraded.theme.palette.surface = "#fcf5de";
  }
  if (upgraded.branding.publicContactEmail === "notifications@doxatreasury.com") {
    upgraded.branding.publicContactEmail = "info@doxatreasury.com";
  }
  const values = upgraded.pages.home.sections.values;
  if (needsCurrentInformationBubbles(values)) values.bubbles = structuredClone(defaultInformationBubbles);
  upgraded.pages.home.sections.editorial ??= structuredClone(defaultHomepageEditorialPanels);
  const genesis = upgraded.pages.home.sections.editorial.genesis;
  if (genesis.title === "Our Genesis" && genesis.body === "TBD.") {
    upgraded.pages.home.sections.editorial.genesis = {
      ...genesis,
      title: defaultHomepageEditorialPanels.genesis.title,
      body: defaultHomepageEditorialPanels.genesis.body,
      quoteReference: defaultHomepageEditorialPanels.genesis.quoteReference,
      quote: defaultHomepageEditorialPanels.genesis.quote,
    };
  }
  const scriptorium = upgraded.pages.home.sections.editorial.scriptorium;
  if (scriptorium.title === "From the Scriptorium" && scriptorium.body === "TBD.") {
    upgraded.pages.home.sections.editorial.scriptorium = {
      ...scriptorium,
      body: defaultHomepageEditorialPanels.scriptorium.body,
    };
  }
  const socials = upgraded.pages.home.sections.newsletter;
  if (
    socials.title === "Thoughtful updates, delivered with care." &&
    socials.body === "Receive occasional news as new cards, collections and stories become available to explore."
  ) {
    upgraded.pages.home.sections.newsletter = {
      eyebrow: "Community",
      title: "Our Socials",
      body: "Follow us on social media for live updates, events, to show support, and share your experiences!",
    };
  }
  upgraded.footer.groups = upgraded.footer.groups.map((group) => {
    const additions = footerLinkUpgrades[group.id] ?? [];
    const ids = new Set(group.links.map((link) => link.id));
    const heading = group.id === "explore" && group.heading === "Explore"
      ? "Links"
      : group.id === "account" && group.heading === "Account"
        ? "More"
        : group.heading;
    return {
      ...group,
      heading,
      links: [...group.links, ...additions.filter((link) => !ids.has(link.id))].slice(0, 8),
    };
  });
  return upgraded;
}
