import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Circle,
  CircleAlert,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Globe2,
  History,
  Images,
  Image as ImageIcon,
  LayoutTemplate,
  LoaderCircle,
  Mail,
  Maximize2,
  Minimize2,
  Monitor,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  PanelTop,
  RotateCcw,
  Redo2,
  Save,
  Search,
  Send,
  Settings2,
  ShoppingBag,
  Smartphone,
  Tablet,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RichTextField } from "../../admin/components";
import { useUnsavedChanges } from "../../admin/utils";
import {
  cloneWebsiteContent,
  defaultWebsiteContent,
  homeSectionIds,
  websiteContentSchema,
  type HomeSectionId,
  type WebsiteContent,
  type WebsitePageId,
} from "../../cms/websiteContent";
import { PageMeta } from "../../components/PageMeta";
import { SafeRichText } from "../../components/SafeRichText";
import { SiteBrand } from "../../components/Layout";
import { siteThemeCssVariables } from "../../lib/siteTheme";
import {
  deleteWebsiteMedia,
  getPublishedWebsiteContent,
  getWebsiteContentEditorState,
  listWebsiteContentVersions,
  listWebsiteMedia,
  publishWebsiteContent,
  restoreWebsiteContentVersion,
  saveWebsiteContentDraft,
  uploadWebsiteMedia,
  type WebsiteEditorState,
  type WebsiteMediaItem,
  type WebsiteRevision,
} from "../../lib/websiteEditor";
import type { SiteTheme } from "../../types";
import { WebsiteDraftPreview } from "./WebsiteDraftPreview";
import {
  targetsForPage,
  websiteEditorTargets,
} from "./websiteEditorTargets";

type EditorSection =
  | "overview"
  | WebsitePageId
  | "header"
  | "footer"
  | "theme"
  | "branding"
  | "storeCopy"
  | "seo"
  | "media"
  | "history";
type Viewport = "desktop" | "tablet" | "mobile";
const EditorSelectionContext = createContext<string | null>(null);

type EditorLoadingStageId = "workspace" | "content" | "draft" | "editor";
type EditorLoadingStageStatus = "pending" | "active" | "complete" | "failed";
type EditorLoadingStage = {
  id: EditorLoadingStageId;
  label: string;
  detail: string;
  status: EditorLoadingStageStatus;
};

type PublishStageId = "content" | "code" | "backup" | "live";
type PublishStage = {
  id: PublishStageId;
  label: string;
  detail: string;
  status: EditorLoadingStageStatus;
};
type PublishFlow =
  | { state: "running"; stages: PublishStage[] }
  | { state: "complete"; stages: PublishStage[]; revision: number; publicContentConfirmed: boolean }
  | { state: "failed"; stages: PublishStage[]; failedStage: PublishStageId };

// Automated tests skip the deliberate visual holds; production keeps every
// startup checkpoint readable for three seconds.
const EDITOR_LOADING_STAGE_MINIMUM_MS = import.meta.env.MODE === "test" ? 0 : 3_000;

function initialLoadingStages(): EditorLoadingStage[] {
  return [
    {
      id: "workspace",
      label: "Connecting to your workspace…",
      detail: "Waiting to confirm your administrator workspace.",
      status: "pending",
    },
    {
      id: "content",
      label: "Loading current page content…",
      detail: "Waiting to load editable website content.",
      status: "pending",
    },
    {
      id: "draft",
      label: "Preparing draft content…",
      detail: "Waiting to prepare saved changes.",
      status: "pending",
    },
    {
      id: "editor",
      label: "Preparing your editor…",
      detail: "Waiting to assemble your workspace.",
      status: "pending",
    },
  ];
}

function initialPublishStages(): PublishStage[] {
  return [
    {
      id: "content",
      label: "Preparing published content…",
      detail: "Waiting to check the saved draft.",
      status: "pending",
    },
    {
      id: "code",
      label: "Uploading new code…",
      detail: "Waiting to determine whether this release includes application code.",
      status: "pending",
    },
    {
      id: "backup",
      label: "Preparing backups…",
      detail: "Waiting to record a recoverable publish version.",
      status: "pending",
    },
    {
      id: "live",
      label: "Publishing to live website…",
      detail: "Waiting to confirm the public content record.",
      status: "pending",
    },
  ];
}

function LoadingStageIcon({ status }: { status: EditorLoadingStageStatus }) {
  if (status === "complete") return <Check />;
  if (status === "active") return <LoaderCircle />;
  if (status === "failed") return <CircleAlert />;
  return <Circle />;
}

function WebsiteEditorLoadingScreen({
  stages,
  failedStage,
  onRetry,
}: {
  stages: EditorLoadingStage[];
  failedStage: EditorLoadingStageId | null;
  onRetry: () => void;
}) {
  const completeStages = stages.filter((stage) => stage.status === "complete").length;
  const activeStage = stages.find((stage) => stage.status === "active");
  const failed = failedStage
    ? stages.find((stage) => stage.id === failedStage)
    : undefined;
  const progress = `${(completeStages / stages.length) * 100}%`;

  return (
    <main
      className={`website-editor-loading${failed ? " has-error" : ""}`}
      role={failed ? "alert" : "status"}
      aria-labelledby="website-editor-loading-title"
    >
      <div className="website-editor-loading-skeleton" aria-hidden="true">
        <span /><span /><span /><i /><i /><i />
      </div>
      <section className="website-editor-loading-card">
        <header>
          <div>
            <p className="eyebrow">Doxa Cards · Website Editor</p>
            <small>{failed ? "Workspace needs attention" : "Preparing workspace"}</small>
          </div>
          <span className={failed ? "error" : ""}>{failed ? "Action needed" : "Opening"}</span>
        </header>
        <div className="website-editor-loading-intro">
          <div className="website-editor-loading-mark" aria-hidden="true">
            <i /><i /><i /><b>D</b>
          </div>
          <div>
            <h1 id="website-editor-loading-title">
              {failed ? "We couldn't finish opening the Website Editor." : "Getting everything ready"}
            </h1>
            <p>
              {failed
                ? `${failed.label} could not be completed. Please try again.`
                : "Preparing your website, design settings and saved drafts."}
            </p>
          </div>
        </div>
        <ol className="website-editor-loading-stages">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status}>
              <span aria-hidden="true"><LoadingStageIcon status={stage.status} /></span>
              <div>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </div>
              {stage.status === "complete" && <em>Ready</em>}
              {stage.status === "active" && <em>Working</em>}
              {stage.status === "failed" && <em>Couldn&apos;t finish</em>}
            </li>
          ))}
        </ol>
        {!failed && (
          <>
            <div className="website-editor-loading-progress" aria-hidden="true">
              <i style={{ width: progress }} />
            </div>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {activeStage
                ? `${activeStage.label} ${activeStage.detail}`
                : `${completeStages} of ${stages.length} workspace preparation stages complete.`}
            </p>
          </>
        )}
        {failed && (
          <footer>
            <button className="button primary" onClick={onRetry}>Try again</button>
            <a className="button secondary" href="/admin">Return to dashboard</a>
          </footer>
        )}
      </section>
    </main>
  );
}

function WebsiteEditorPublishingScreen({
  flow,
  onContinueEditing,
  onReturnToEditor,
}: {
  flow: PublishFlow;
  onContinueEditing: () => void;
  onReturnToEditor: () => void;
}) {
  const stages = flow.stages;
  const completeStages = stages.filter((stage) => stage.status === "complete").length;
  const activeStage = stages.find((stage) => stage.status === "active");
  const failed = flow.state === "failed";
  const complete = flow.state === "complete";
  const progress = `${(completeStages / stages.length) * 100}%`;

  return (
    <main
      className={`website-editor-loading website-editor-publishing${complete ? " is-complete" : ""}${failed ? " has-error" : ""}`}
      role={failed ? "alert" : "status"}
      aria-labelledby="website-editor-publishing-title"
    >
      <div className="website-editor-loading-skeleton" aria-hidden="true">
        <span /><span /><span /><i /><i /><i />
      </div>
      <section className="website-editor-loading-card">
        <header>
          <div>
            <p className="eyebrow">Doxa Cards · Website Editor</p>
            <small>{complete ? "Published website" : failed ? "Publish needs attention" : "Publishing website"}</small>
          </div>
          <span className={failed ? "error" : complete ? "complete" : ""}>
            {complete ? "Published" : failed ? "Action needed" : "Publishing"}
          </span>
        </header>
        <div className="website-editor-loading-intro">
          <div className="website-editor-publish-mark" aria-hidden="true">
            {complete && <><i /><i /><i /><i /><i /><i /></>}
            <span><Check /></span>
          </div>
          <div>
            <h1 id="website-editor-publishing-title">
              {complete ? "Site published!" : failed ? "We couldn't finish publishing your website." : "Publishing your website"}
            </h1>
            <p>
              {complete
                ? `Version ${flow.revision} is now the published website.${flow.publicContentConfirmed ? " The public content record is ready for visitors." : " The publish was completed, but its public record could not be confirmed from this browser."}`
                : failed
                  ? "Your live website has not been changed by this unfinished publish. Return to the editor to review the saved draft."
                  : "We are checking the saved release and recording it safely before confirming it for visitors."}
            </p>
          </div>
        </div>
        <ol className="website-editor-loading-stages">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status}>
              <span aria-hidden="true"><LoadingStageIcon status={stage.status} /></span>
              <div>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </div>
              {stage.status === "complete" && <em>Ready</em>}
              {stage.status === "active" && <em>Working</em>}
              {stage.status === "failed" && <em>Couldn&apos;t finish</em>}
            </li>
          ))}
        </ol>
        {!complete && !failed && (
          <>
            <div className="website-editor-loading-progress" aria-hidden="true">
              <i style={{ width: progress }} />
            </div>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {activeStage
                ? `${activeStage.label} ${activeStage.detail}`
                : `${completeStages} of ${stages.length} publishing checkpoints complete.`}
            </p>
          </>
        )}
        {complete && (
          <footer className="website-editor-publish-complete-actions">
            <p>Continue editing?</p>
            <button className="button primary" onClick={onContinueEditing}>Continue editing</button>
          </footer>
        )}
        {failed && (
          <footer>
            <button className="button secondary" onClick={onReturnToEditor}>Return to editor</button>
          </footer>
        )}
      </section>
    </main>
  );
}

const sectionGroups: Array<{
  label: string;
  items: Array<{ id: EditorSection; label: string; icon: typeof Globe2 }>;
}> = [
  {
    label: "Workspace",
    items: [{ id: "overview", label: "Overview", icon: Globe2 }],
  },
  {
    label: "Pages",
    items: [
      { id: "home", label: "Home", icon: LayoutTemplate },
      { id: "about", label: "About", icon: BookOpen },
      { id: "shop", label: "Shop", icon: FileText },
      { id: "contact", label: "Contact", icon: FileText },
      { id: "storeCopy", label: "Storefront messages", icon: FileText },
    ],
  },
  {
    label: "Site design",
    items: [
      { id: "header", label: "Header & navigation", icon: PanelTop },
      { id: "footer", label: "Footer", icon: LayoutTemplate },
      { id: "theme", label: "Theme & colours", icon: Palette },
      { id: "branding", label: "Branding", icon: Type },
      { id: "seo", label: "SEO", icon: Search },
    ],
  },
  {
    label: "Library",
    items: [
      { id: "media", label: "Media library", icon: ImageIcon },
      { id: "history", label: "Publishing history", icon: History },
    ],
  },
];

function fieldError(error: unknown) {
  if (error instanceof Error)
    return error.message.replace(/^FirebaseError:\s*/i, "");
  return "The request could not be completed.";
}

function TextField({
  label,
  value,
  onChange,
  maxLength = 160,
  hint,
  type = "text",
  fieldId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  hint?: string;
  type?: "text" | "email" | "url";
  fieldId?: string;
}) {
  return (
    <label className="website-field">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <input
        data-editor-field={fieldId}
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
      <em>
        {value.length}/{maxLength}
      </em>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  maxLength = 1000,
  rows = 4,
  hint,
  fieldId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  hint?: string;
  fieldId?: string;
}) {
  return (
    <label className="website-field website-field-wide">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <textarea
        data-editor-field={fieldId}
        value={value}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
      />
      <em>
        {value.length}/{maxLength}
      </em>
    </label>
  );
}

function MediaField({
  label,
  value,
  onChange,
  media,
  hint = "Upload images in the Media library, then select one here.",
  fieldId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  media: WebsiteMediaItem[];
  hint?: string;
  fieldId?: string;
}) {
  const selected = media.some((item) => item.url === value) ? value : "";
  return (
    <label className="website-field website-field-wide">
      <span>{label}</span>
      <small>{hint}</small>
      <div className="website-media-field">
        <input
          data-editor-field={fieldId}
          type="url"
          value={value}
          maxLength={2000}
          onChange={(event) => onChange(event.target.value)}
        />
        <select
          aria-label={`Choose ${label.toLowerCase()} from media library`}
          value={selected}
          onChange={(event) =>
            event.target.value && onChange(event.target.value)
          }
        >
          <option value="">Choose from media library…</option>
          {media
            .filter((item) => item.url)
            .map((item) => (
              <option key={`${item.path}-${item.generation}`} value={item.url}>
                {item.path.split("/").at(-1)}
              </option>
            ))}
        </select>
      </div>
    </label>
  );
}

function EditorGroup({
  controlId,
  title,
  description,
  children,
}: {
  controlId?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const selectedControlId = useContext(EditorSelectionContext);
  if (selectedControlId && controlId !== selectedControlId) return null;
  return (
    <section className="website-editor-group" data-editor-control={controlId}>
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="website-editor-fields">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="website-toggle">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function themeFor(content: WebsiteContent): SiteTheme {
  const labels = Object.fromEntries(
    content.navigation.primary.map((item) => [item.id, item.label]),
  );
  const groups = content.footer.groups;
  const get = (id: string, fallback: string) =>
    groups.flatMap((group) => group.links).find((item) => item.id === id)
      ?.label ?? fallback;
  return {
    version: 1,
    ...content.theme,
    header: {
      brandName: content.branding.headerName,
      navigation: {
        home: labels.home ?? "Home",
        shop: labels.shop ?? "Shop",
        about: labels.about ?? "About",
        contact: labels.contact ?? "Contact",
      },
    },
    footer: {
      brandName: content.branding.footerName,
      description: content.footer.description,
      exploreHeading: groups[0]?.heading ?? "Explore",
      accountHeading: groups[1]?.heading ?? "Account",
      copyrightText: content.footer.copyrightText,
      navigation: {
        shop: get("shop", "Shop"),
        about: get("about", "About"),
        contact: get("contact", "Contact"),
        account: get("account", "Account"),
        orders: get("orders", "Orders"),
        security: get("security", "Security"),
        administrator: get("administrator", "Administrator"),
      },
    },
  };
}

function WebsitePreview({
  content,
  page,
  viewport,
}: {
  content: WebsiteContent;
  page: WebsitePageId;
  viewport: Viewport;
}) {
  const theme = themeFor(content);
  const home = content.pages.home;
  const previewPage = content.pages[page];
  const previewImage = "image" in previewPage ? previewPage.image : undefined;
  const homeSection = (id: HomeSectionId) => {
    if (id === "hero")
      return (
        <section
          className="website-preview-hero"
          style={{
            backgroundImage: `linear-gradient(#1e100870,#1e1008aa),url(${home.sections.hero.imageUrl})`,
          }}
        >
          <p>{home.eyebrow}</p>
          <h1>{home.title}</h1>
          <span>{home.body}</span>
          <div>
            <button>{home.sections.hero.primaryActionLabel}</button>
            <button>{home.sections.hero.secondaryActionLabel}</button>
          </div>
        </section>
      );
    if (id === "values")
      return (
        <section className="website-preview-values">
          {(["first", "second", "third"] as const).map((item) => (
            <div key={item}>
              <strong>{home.sections.values[`${item}Title`]}</strong>
              <span>{home.sections.values[`${item}Body`]}</span>
            </div>
          ))}
        </section>
      );
    if (id === "featured")
      return (
        <section className="website-preview-standard">
          <p>{home.sections.featured.eyebrow}</p>
          <h2>{home.sections.featured.title}</h2>
          <span>{home.sections.featured.body}</span>
          <div className="website-preview-products">
            <i />
            <i />
            <i />
          </div>
        </section>
      );
    if (id === "story")
      return (
        <section className="website-preview-story">
          <img src={home.sections.story.imageUrl} alt="" />
          <div>
            <p>{home.sections.story.eyebrow}</p>
            <h2>{home.sections.story.title}</h2>
            <SafeRichText value={home.sections.story.body} />
            <button>{home.sections.story.actionLabel}</button>
          </div>
        </section>
      );
    return (
      <section className="website-preview-newsletter">
        <div>
          <p>{content.copy.newsletter.eyebrow}</p>
          <h2>{content.copy.newsletter.title}</h2>
          <span>{content.copy.newsletter.body}</span>
        </div>
        <i />
      </section>
    );
  };
  return (
    <div className={`website-preview-shell ${viewport}`}>
      <div
        className="website-preview-site site-shell"
        style={siteThemeCssVariables(theme)}
      >
        {content.header.announcementEnabled &&
          content.header.announcementText && (
            <div className="website-preview-announcement">
              {content.header.announcementText}
            </div>
          )}
        <header>
          <SiteBrand theme={theme} placement="header" />
          <nav>
            {content.navigation.primary
              .filter((item) => item.visible)
              .map((item) => (
                <span key={item.id}>{item.label}</span>
              ))}
          </nav>
          <span className="website-preview-icons">○ ◇</span>
        </header>
        <main>
          {page === "home" ? (
            home.layout.order.map((id) =>
              home.layout.visibility[id] ? (
                <div key={id}>{homeSection(id)}</div>
              ) : null,
            )
          ) : (
            <>
              <section className="website-preview-page-hero">
                {previewImage && <img src={previewImage.imageUrl} alt="" />}
                <div>
                  <p>{previewPage.eyebrow}</p>
                  <h1>{previewPage.title}</h1>
                  <span>{previewPage.body}</span>
                </div>
              </section>
              <section className="website-preview-placeholder">
                <i />
                <i />
                <i />
              </section>
            </>
          )}
        </main>
        <footer>
          <div>
            <SiteBrand theme={theme} placement="footer" />
            <p>{content.footer.description}</p>
          </div>
          {content.footer.groups.map((group) => (
            <div key={group.id}>
              <strong>{group.heading}</strong>
              {group.links
                .filter((item) => item.visible)
                .map((item) => (
                  <span key={item.id}>{item.label}</span>
                ))}
            </div>
          ))}
        </footer>
      </div>
    </div>
  );
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function colourLuminance(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0;
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const first = colourLuminance(foreground);
  const second = colourLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function WebsiteEditorPage() {
  const [editorState, setEditorState] = useState<WebsiteEditorState | null>(
    null,
  );
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [baseline, setBaseline] = useState("");
  const [section, setSection] = useState<EditorSection>("overview");
  const [previewPage, setPreviewPage] = useState<WebsitePageId | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const stored = Number(localStorage.getItem("doxa:editor-inspector-width"));
    return Number.isFinite(stored) && stored >= 340 && stored <= 680
      ? stored
      : 430;
  });
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState("");
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const [versions, setVersions] = useState<WebsiteRevision[]>([]);
  const [media, setMedia] = useState<WebsiteMediaItem[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingStages, setLoadingStages] = useState<EditorLoadingStage[]>(
    initialLoadingStages,
  );
  const [loadFailure, setLoadFailure] = useState<EditorLoadingStageId | null>(
    null,
  );
  const [editorEntering, setEditorEntering] = useState(false);
  const [publishFlow, setPublishFlow] = useState<PublishFlow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [operationFailure, setOperationFailure] = useState<"save" | "publish" | "">("");
  const undoStackRef = useRef<WebsiteContent[]>([]);
  const redoStackRef = useRef<WebsiteContent[]>([]);
  const editSessionRef = useRef({ active: false, recorded: false });
  const loadRequestRef = useRef(0);
  const contentRef = useRef<WebsiteContent | null>(content);
  contentRef.current = content;
  const [, setHistoryRevision] = useState(0);

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const stillCurrent = () => loadRequestRef.current === requestId;
    const updateStage = (
      id: EditorLoadingStageId,
      status: EditorLoadingStageStatus,
      detail: string,
    ) => {
      if (!stillCurrent()) return;
      setLoadingStages((current) =>
        current.map((stage) =>
          stage.id === id ? { ...stage, status, detail } : stage,
        ),
      );
    };
    const runStage = async <T,>(
      id: EditorLoadingStageId,
      activeDetail: string,
      completeDetail: (result: T) => string,
      work: () => Promise<T> | T,
    ) => {
      updateStage(id, "active", activeDetail);
      const startedAt = performance.now();
      const result = await work();
      if (!stillCurrent()) return result;
      updateStage(id, "complete", completeDetail(result));
      const remaining = Math.max(
        0,
        EDITOR_LOADING_STAGE_MINIMUM_MS - (performance.now() - startedAt),
      );
      if (remaining > 0)
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      return result;
    };

    setLoading(true);
    setLoadFailure(null);
    setEditorEntering(false);
    setLoadingStages(initialLoadingStages());
    setMessage(null);
    setVersions([]);
    setMedia([]);
    let activeStage: EditorLoadingStageId = "workspace";
    let primaryContentRequest: ReturnType<typeof getWebsiteContentEditorState> | null = null;
    const startBackgroundResources = () => {
      const historyRequest = listWebsiteContentVersions().catch((error) => {
        console.warn("Website editor version history could not be loaded.", error);
        return [];
      });
      const mediaRequest = listWebsiteMedia().catch((error) => {
        console.warn("Website editor media library could not be loaded.", error);
        return [];
      });
      void historyRequest.then((history) => {
        if (stillCurrent()) setVersions(history);
      });
      void mediaRequest.then((library) => {
        if (stillCurrent()) setMedia(library);
      });
    };
    try {
      await runStage(
        activeStage,
        "Confirming your administrator workspace…",
        () => "Administrator access confirmed.",
        async () => {
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          primaryContentRequest = Promise.resolve().then(() =>
            getWebsiteContentEditorState(),
          );
          void primaryContentRequest.catch(() => undefined);
          startBackgroundResources();
        },
      );
      if (!stillCurrent()) return;

      activeStage = "content";
      const next = await runStage(
        activeStage,
        "Fetching your editable website content…",
        (state) => {
          const pageCount = Object.keys(state.draft.content.pages).length;
          return `Loaded ${pageCount} editable pages and shared site settings.`;
        },
        () => primaryContentRequest ?? getWebsiteContentEditorState(),
      );
      if (!stillCurrent()) return;

      activeStage = "draft";
      const prepared = await runStage(
        activeStage,
        "Comparing saved draft and published content…",
        (state) =>
          state.published &&
          JSON.stringify(state.draft.content) === JSON.stringify(state.published.content)
            ? "Saved draft prepared for editing. No unpublished changes found."
            : "Saved draft prepared for editing.",
        () => {
          const parsedDraft = websiteContentSchema.safeParse(next.draft.content);
          const parsedPublished = next.published
            ? websiteContentSchema.safeParse(next.published.content)
            : null;
          if (
            !parsedDraft.success ||
            (parsedPublished !== null && !parsedPublished.success)
          )
            throw new Error("The saved draft could not be prepared.");
          return {
            ...next,
            draft: {
              ...next.draft,
              content: cloneWebsiteContent(parsedDraft.data),
            },
            published: next.published
              ? {
                  ...next.published,
                  content: cloneWebsiteContent(parsedPublished!.data),
                }
              : null,
          };
        },
      );
      if (!stillCurrent()) return;

      activeStage = "editor";
      await runStage(
        activeStage,
        "Building your overview, navigation and preview tools…",
        () => "Overview, navigation and editing controls are ready.",
        async () => {
          setEditorState(prepared);
          setContent(cloneWebsiteContent(prepared.draft.content));
          setBaseline(JSON.stringify(prepared.draft.content));
          undoStackRef.current = [];
          redoStackRef.current = [];
          setHistoryRevision((current) => current + 1);
          await new Promise<void>((resolve) =>
            window.requestAnimationFrame(() => resolve()),
          );
        },
      );
      if (!stillCurrent()) return;
      setEditorEntering(true);
      setLoading(false);
    } catch (error) {
      if (!stillCurrent()) return;
      console.error("Website Editor startup failed.", error);
      updateStage(activeStage, "failed", "We couldn't complete this step.");
      setLoadFailure(activeStage);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(
    () => () => {
      loadRequestRef.current += 1;
    },
    [],
  );
  const dirty = Boolean(content && JSON.stringify(content) !== baseline);
  const savedDraftMatchesPublished = Boolean(
    editorState?.published &&
      JSON.stringify(editorState.draft.content) === JSON.stringify(editorState.published.content),
  );
  const unpublishedDraftChanges = Boolean(editorState && !savedDraftMatchesPublished);
  useUnsavedChanges(
    dirty,
    "Leave the website editor and discard your unsaved draft changes?",
  );

  const mutate = (change: (draft: WebsiteContent) => void) => {
    setOperationFailure("");
    setContent((current) => {
      if (!current) return current;
      const next = cloneWebsiteContent(current);
      change(next);
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      if (!editSessionRef.current.active || !editSessionRef.current.recorded) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), cloneWebsiteContent(current)];
        editSessionRef.current.recorded = true;
      }
      redoStackRef.current = [];
      setHistoryRevision((value) => value + 1);
      return next;
    });
  };
  const undo = () => {
    setContent((current) => {
      const previous = undoStackRef.current.pop();
      if (!current || !previous) return current;
      redoStackRef.current = [...redoStackRef.current.slice(-49), cloneWebsiteContent(current)];
      setHistoryRevision((value) => value + 1);
      return cloneWebsiteContent(previous);
    });
  };
  const redo = () => {
    setContent((current) => {
      const next = redoStackRef.current.pop();
      if (!current || !next) return current;
      undoStackRef.current = [...undoStackRef.current.slice(-49), cloneWebsiteContent(current)];
      setHistoryRevision((value) => value + 1);
      return cloneWebsiteContent(next);
    });
  };
  const updatePage = (page: WebsitePageId) => {
    setSection(page);
    setPreviewPage(page);
    setInspectorOpen(true);
    setSelectedTarget("");
  };
  useEffect(() => {
    if (!previewFullscreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewFullscreen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [previewFullscreen]);
  useEffect(() => {
    localStorage.setItem("doxa:editor-inspector-width", String(inspectorWidth));
  }, [inspectorWidth]);
  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", handleUndo);
    return () => document.removeEventListener("keydown", handleUndo);
  });

  const selectPreviewTarget = (target: string, scrollPreview = false) => {
    const targetDefinition = websiteEditorTargets[target];
    if (!targetDefinition) return;
    if (
      targetDefinition.section === "home" ||
      targetDefinition.section === "about" ||
      targetDefinition.section === "shop" ||
      targetDefinition.section === "contact"
    ) {
      setSection(targetDefinition.section);
      setPreviewPage(targetDefinition.page);
    } else {
      setSection(targetDefinition.section);
    }
    setSelectedTarget(target);
    setInspectorOpen(true);
    window.setTimeout(() => {
      const control = inspectorScrollRef.current?.querySelector<HTMLElement>(
        `[data-editor-control="${targetDefinition.controlId}"]`,
      );
      control?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      if (targetDefinition.fieldId) {
        control
          ?.querySelector<HTMLElement>(`[data-editor-field="${targetDefinition.fieldId}"]`)
          ?.focus({ preventScroll: true });
      }
      if (scrollPreview) {
        document
          .querySelector<HTMLElement>(`.website-draft-preview-surface [data-editor-target="${target}"]`)
          ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
    }, 0);
  };

  const resizeInspector = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const move = (moveEvent: globalThis.MouseEvent) => {
      const next = Math.min(680, Math.max(340, startWidth + startX - moveEvent.clientX));
      setInspectorWidth(next);
    };
    const stop = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", stop);
  };
  const saveDraft = async () => {
    if (!content || !editorState) return;
    const validation = websiteContentSchema.safeParse(content);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setMessage({
        tone: "error",
        text: `${issue.path.join(" → ") || "Website"}: ${issue.message}`,
      });
      return;
    }
    setBusy("save");
    setOperationFailure("");
    setMessage(null);
    const savedSnapshot = JSON.stringify(validation.data);
    try {
      const result = await saveWebsiteContentDraft(
        editorState.draft.revision,
        validation.data,
      );
      const hasNewerChanges = JSON.stringify(contentRef.current) !== savedSnapshot;
      setEditorState((current) => current ? ({
        ...current,
        draft: {
          ...current.draft,
          revision: result.revision,
          basedOnPublishedRevision: result.basedOnPublishedRevision,
          content: validation.data,
          updatedAt: new Date().toISOString(),
        },
      }) : current);
      if (!hasNewerChanges) setContent(cloneWebsiteContent(validation.data));
      setBaseline(savedSnapshot);
      setMessage({
        tone: hasNewerChanges ? "info" : "success",
        text: hasNewerChanges
          ? "Draft saved. Your newer edits are still unsaved."
          : "Draft saved. The public site has not changed.",
      });
    } catch (error) {
      setOperationFailure("save");
      setMessage({ tone: "error", text: fieldError(error) });
    } finally {
      setBusy("");
    }
  };
  const publish = async () => {
    if (
      !editorState ||
      dirty ||
      !window.confirm("Publish this saved draft to the public website now?")
    )
      return;
    setBusy("publish");
    setOperationFailure("");
    setMessage(null);
    let stages = initialPublishStages();
    const updateStage = (
      id: PublishStageId,
      status: EditorLoadingStageStatus,
      detail: string,
    ) => {
      stages = stages.map((stage) =>
        stage.id === id ? { ...stage, status, detail } : stage,
      );
      setPublishFlow({ state: "running", stages });
    };
    const runStage = async <T,>(
      id: PublishStageId,
      activeDetail: string,
      completeDetail: (result: T) => string,
      work: () => Promise<T> | T,
    ) => {
      updateStage(id, "active", activeDetail);
      const result = await work();
      updateStage(id, "complete", completeDetail(result));
      return result;
    };
    setPublishFlow({ state: "running", stages });
    try {
      await runStage(
        "content",
        "Checking the saved draft before release…",
        () => "Saved draft is ready to publish.",
        () => {
          const parsed = websiteContentSchema.safeParse(editorState.draft.content);
          if (!parsed.success) throw new Error("The saved draft could not be prepared for publishing.");
          return parsed.data;
        },
      );

      await runStage(
        "code",
        "Checking whether this content release includes application code…",
        () => "No application-code upload is required for this content-only release.",
        () => Promise.resolve(),
      );

      const result = await runStage(
        "backup",
        "Creating the protected publish transaction and recoverable version…",
        (published) => `Version ${published.publishedRevision} is recorded in publishing history.`,
        () => publishWebsiteContent(
          editorState.draft.revision,
          editorState.published?.revision ?? 0,
        ),
      );
      window.dispatchEvent(new Event("cards:content-updated"));
      const publicContentConfirmed = await runStage(
        "live",
        "Checking the public website's published content…",
        (confirmed) => confirmed
          ? "The published content record is ready for visitors."
          : "Publishing completed. Refresh the storefront to confirm the public content.",
        async () => {
          try {
            const published = await getPublishedWebsiteContent();
            return Boolean(
              published &&
                JSON.stringify(published) === JSON.stringify(editorState.draft.content),
            );
          } catch {
            return false;
          }
        },
      );
      setPublishFlow({
        state: "complete",
        stages,
        revision: result.publishedRevision,
        publicContentConfirmed,
      });
    } catch (error) {
      const active = stages.find((stage) => stage.status === "active")?.id ?? "backup";
      updateStage(active, "failed", "We couldn't complete this step.");
      setPublishFlow({ state: "failed", stages, failedStage: active });
      setOperationFailure("publish");
      setMessage({ tone: "error", text: fieldError(error) });
    } finally {
      setBusy("");
    }
  };
  const restore = async (revision: number) => {
    if (
      !editorState ||
      !window.confirm(
        `Restore published revision ${revision} into the draft for review?`,
      )
    )
      return;
    setBusy(`restore-${revision}`);
    try {
      await restoreWebsiteContentVersion(
        revision,
        editorState.draft.revision,
        editorState.published?.revision ?? 0,
      );
      await load();
      setMessage({
        tone: "success",
        text: `Revision ${revision} was restored to the draft. Review it before publishing.`,
      });
    } catch (error) {
      setMessage({ tone: "error", text: fieldError(error) });
    } finally {
      setBusy("");
    }
  };
  const copyToClipboard = async (value: string) => {
    if (!document.hasFocus() || !navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("upload");
    try {
      const url = await uploadWebsiteMedia(file);
      if (section === "branding")
        mutate((draft) => {
          draft.theme.logo.imageUrl = url;
          draft.theme.logo.mode = "image";
        });
      const copied = await copyToClipboard(url);
      const library = await listWebsiteMedia().catch(() => media);
      setMedia(library);
      setMessage({
        tone: "success",
        text:
          section === "branding"
            ? "Logo uploaded and selected in this draft."
            : copied
              ? "Image uploaded. Its secure URL was copied to your clipboard."
              : "Image uploaded. Use Copy URL when you are ready to copy its address.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: fieldError(error) });
    } finally {
      setBusy("");
      event.target.value = "";
    }
  };
  const removeMedia = async (item: WebsiteMediaItem) => {
    if (
      !item.deletionAvailable ||
      !window.confirm(`Permanently delete ${item.path.split("/").at(-1)}?`)
    )
      return;
    setBusy(`media-${item.generation}`);
    try {
      await deleteWebsiteMedia(item.path, item.generation);
      setMedia((current) =>
        current.filter((entry) => entry.path !== item.path),
      );
      setMessage({ tone: "success", text: "Unused media deleted." });
    } catch (error) {
      setMessage({ tone: "error", text: fieldError(error) });
    } finally {
      setBusy("");
    }
  };
  const filteredMedia = useMemo(
    () =>
      media.filter((item) =>
        item.path.toLowerCase().includes(mediaSearch.toLowerCase()),
      ),
    [media, mediaSearch],
  );

  if (publishFlow)
    return (
      <>
        <PageMeta
          title="Publishing website — Admin"
          description="Publishing the saved Doxa Cards website content."
        />
        <WebsiteEditorPublishingScreen
          flow={publishFlow}
          onContinueEditing={() => {
            setPublishFlow(null);
            void load();
          }}
          onReturnToEditor={() => setPublishFlow(null)}
        />
      </>
    );

  if (loading || !content || !editorState)
    return (
      <WebsiteEditorLoadingScreen
        stages={loadingStages}
        failedStage={loadFailure}
        onRetry={() => void load()}
      />
    );

  const selectedDefinition = selectedTarget
    ? websiteEditorTargets[selectedTarget]
    : undefined;
  const selectedPage =
    section === "home" || section === "about" || section === "shop" || section === "contact"
      ? section
      : null;
  const generalTargetForPage: Record<WebsitePageId, string> = {
    home: "home-hero-heading",
    about: "about-introduction",
    shop: "shop-introduction",
    contact: "contact-introduction",
  };

  const pageEditor = (page: WebsitePageId) => {
    const item = content.pages[page];
    return (
      <>
        <EditorGroup
          controlId="page-introduction"
          title="Page introduction"
          description="The principal public message and search preview for this page."
        >
          <TextField
            label="Eyebrow"
            value={item.eyebrow}
            maxLength={80}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].eyebrow = value;
              })
            }
          />
          <TextField
            label="Page title"
            fieldId="page-title"
            value={item.title}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].title = value;
              })
            }
          />
          <RichTextField
            label="Introduction"
            hint="Safe bold, italic, lists and HTTPS links are supported where the page design allows them."
            value={item.body}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].body = value;
              })
            }
            maxLength={10000}
          />
        </EditorGroup>
        <EditorGroup
          controlId="page-seo"
          title="Search & social"
          description="What search engines and social previews should show."
        >
          <TextField
            label="SEO title"
              fieldId="seo-title"
            value={item.seo.title}
            maxLength={120}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].seo.title = value;
              })
            }
          />
          <TextArea
            label="SEO description"
              fieldId="seo-description"
            value={item.seo.description}
            maxLength={320}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].seo.description = value;
              })
            }
          />
          <MediaField
            label="Social image URL"
              fieldId="seo-image"
            value={item.seo.socialImageUrl}
            onChange={(value) =>
              mutate((draft) => {
                draft.pages[page].seo.socialImageUrl = value;
              })
            }
            media={media}
          />
        </EditorGroup>
      </>
    );
  };

  const renderInspector = () => {
    if (section === "overview")
      return (
        <div className="website-editor-overview">
          <section>
            <Globe2 />
            <div>
              <small>Published revision</small>
              <strong>{editorState.published?.revision ?? 0}</strong>
              <span>
                {editorState.published?.publishedAt
                  ? new Date(editorState.published.publishedAt).toLocaleString(
                      "en-AU",
                    )
                  : "Using compatibility content"}
              </span>
            </div>
          </section>
          <section>
            <FileText />
            <div>
              <small>Draft revision</small>
              <strong>{editorState.draft.revision}</strong>
              <span>
                {dirty
                  ? "Unsaved changes"
                  : savedDraftMatchesPublished
                    ? "Matches live site"
                    : "Saved draft available"}
              </span>
            </div>
          </section>
          <section>
            <ImageIcon />
            <div>
              <small>Managed media</small>
              <strong>{media.length}</strong>
              <span>
                {media.filter((item) => item.referenced).length} currently
                referenced
              </span>
            </div>
          </section>
          <div className="website-editor-welcome">
            <h2>One place to shape the whole storefront.</h2>
            <p>
              Choose a page or design area on the left. Changes appear in the
              live preview immediately, but visitors see nothing until you save
              and publish.
            </p>
            <button
              className="button primary"
              onClick={() => updatePage("home")}
            >
              Edit the home page <ChevronRight />
            </button>
          </div>
        </div>
      );
    if (selectedPage && !selectedDefinition)
      return (
        <div className="website-editor-selection-empty">
          <Settings2 aria-hidden="true" />
          <h3>Select an element to edit</h3>
          <p>Click any highlighted text, image, button or section in the preview to customise it.</p>
          <button
            className="button secondary"
            onClick={() => selectPreviewTarget(generalTargetForPage[selectedPage])}
          >
            Open general page settings
          </button>
        </div>
      );
    if (section === "home")
      return (
        <>
          {pageEditor("home")}
          <EditorGroup controlId="hero" title="Hero">
            <TextField
              label="Gold accent phrase"
              value={content.pages.home.sections.hero.accent}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.accent = value;
                })
              }
            />
            <TextField
              label="Primary button"
              fieldId="hero-primary"
              value={content.pages.home.sections.hero.primaryActionLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.primaryActionLabel = value;
                })
              }
            />
            <TextField
              label="Secondary button"
              fieldId="hero-secondary"
              value={content.pages.home.sections.hero.secondaryActionLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.secondaryActionLabel = value;
                })
              }
            />
            <MediaField
              label="Hero image URL"
              fieldId="hero-image"
              value={content.pages.home.sections.hero.imageUrl}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.imageUrl = value;
                })
              }
              media={media}
            />
            <TextField
              label="Hero alt text"
              value={content.pages.home.sections.hero.imageAlt}
              maxLength={200}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.imageAlt = value;
                })
              }
            />
            <TextField
              label="Image credit"
              value={content.pages.home.sections.hero.imageCredit}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.hero.imageCredit = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup
            title="Section order & visibility"
            description="Essential store functions remain protected; these presentation sections can be rearranged or hidden."
          >
            <div className="website-section-order">
              {content.pages.home.layout.order.map((id, index) => (
                <div key={id}>
                  <span className="website-drag-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{id[0].toUpperCase() + id.slice(1)}</strong>
                  <Toggle
                    label="Visible"
                    checked={content.pages.home.layout.visibility[id]}
                    onChange={(checked) =>
                      mutate((draft) => {
                        draft.pages.home.layout.visibility[id] = checked;
                      })
                    }
                  />
                  <button
                    aria-label={`Move ${id} up`}
                    disabled={index === 0}
                    onClick={() =>
                      mutate((draft) => {
                        draft.pages.home.layout.order = move(
                          draft.pages.home.layout.order,
                          index,
                          -1,
                        );
                      })
                    }
                  >
                    <ArrowUp />
                  </button>
                  <button
                    aria-label={`Move ${id} down`}
                    disabled={index === homeSectionIds.length - 1}
                    onClick={() =>
                      mutate((draft) => {
                        draft.pages.home.layout.order = move(
                          draft.pages.home.layout.order,
                          index,
                          1,
                        );
                      })
                    }
                  >
                    <ArrowDown />
                  </button>
                </div>
              ))}
            </div>
          </EditorGroup>
          <EditorGroup controlId="moving-values" title="Moving values">
            <TextField
              label="Moving line"
              value={content.pages.home.sections.values.marquee}
              maxLength={320}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.values.marquee = value;
                })
              }
            />
            {(["first", "second", "third"] as const).map((id, index) => (
              <div className="website-field-pair" key={id}>
                <TextField
                  label={`Value ${index + 1} title`}
                  value={content.pages.home.sections.values[`${id}Title`]}
                  maxLength={80}
                  onChange={(value) =>
                    mutate((draft) => {
                      draft.pages.home.sections.values[`${id}Title`] = value;
                    })
                  }
                />
                <TextField
                  label={`Value ${index + 1} description`}
                  value={content.pages.home.sections.values[`${id}Body`]}
                  maxLength={160}
                  onChange={(value) =>
                    mutate((draft) => {
                      draft.pages.home.sections.values[`${id}Body`] = value;
                    })
                  }
                />
              </div>
            ))}
          </EditorGroup>
          <EditorGroup controlId="featured" title="Featured collection">
            <TextField
              label="Eyebrow"
              value={content.pages.home.sections.featured.eyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.featured.eyebrow = value;
                })
              }
            />
            <TextField
              label="Heading"
              value={content.pages.home.sections.featured.title}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.featured.title = value;
                })
              }
            />
            <TextArea
              label="Description"
              value={content.pages.home.sections.featured.body}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.featured.body = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup controlId="story" title="Editorial story">
            <TextField
              label="Eyebrow"
              value={content.pages.home.sections.story.eyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.eyebrow = value;
                })
              }
            />
            <TextField
              label="Heading"
              value={content.pages.home.sections.story.title}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.title = value;
                })
              }
            />
            <RichTextField
              label="Story"
              value={content.pages.home.sections.story.body}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.body = value;
                })
              }
              maxLength={3000}
            />
            <MediaField
              label="Story image URL"
              fieldId="story-image"
              value={content.pages.home.sections.story.imageUrl}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.imageUrl = value;
                })
              }
              media={media}
            />
            <TextField
              label="Image alt text"
              value={content.pages.home.sections.story.imageAlt}
              maxLength={200}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.imageAlt = value;
                })
              }
            />
            <TextField
              label="Image credit"
              value={content.pages.home.sections.story.imageCredit}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.imageCredit = value;
                })
              }
            />
            <TextField
              label="Button"
              value={content.pages.home.sections.story.actionLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.home.sections.story.actionLabel = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup controlId="homepage-controls" title="Homepage controls">
            <TextField
              label="Scroll prompt"
              value={content.copy.homeScrollLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.homeScrollLabel = value;
                })
              }
            />
            <TextField
              label="View-all products link"
              value={content.copy.homeViewAllLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.homeViewAllLabel = value;
                })
              }
            />
          </EditorGroup>
        </>
      );
    if (section === "about")
      return (
        <>
          {pageEditor("about")}
          <EditorGroup controlId="about-story" title="Editorial story">
            <TextField
              label="First heading"
              value={content.pages.about.sections.story.firstHeading}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.story.firstHeading = value;
                })
              }
            />
            <TextArea
              label="Supporting text"
              value={content.pages.about.sections.story.secondBody}
              maxLength={3000}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.story.secondBody = value;
                })
              }
            />
            <TextArea
              label="Pull quote"
              value={content.pages.about.sections.story.quote}
              maxLength={500}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.story.quote = value;
                })
              }
            />
            <TextField
              label="Second heading"
              value={content.pages.about.sections.story.secondHeading}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.story.secondHeading = value;
                })
              }
            />
            <TextArea
              label="Final text"
              value={content.pages.about.sections.story.thirdBody}
              maxLength={3000}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.story.thirdBody = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup title="Explore panel">
            <TextField
              label="Eyebrow"
              value={content.pages.about.sections.explore.eyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.explore.eyebrow = value;
                })
              }
            />
            {content.pages.about.sections.explore.items.map((item, index) => (
              <TextField
                key={index}
                label={`Point ${index + 1}`}
                value={item}
                maxLength={240}
                onChange={(value) =>
                  mutate((draft) => {
                    draft.pages.about.sections.explore.items[index] = value;
                  })
                }
              />
            ))}
            <TextField
              label="Button"
              value={content.pages.about.sections.explore.actionLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.sections.explore.actionLabel = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup controlId="about-image" title="Page image">
            <MediaField
              label="Image URL"
              value={content.pages.about.image?.imageUrl ?? ""}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.about.image = {
                    ...(draft.pages.about.image ?? {
                      imageUrl: value,
                      imageAlt: "About Doxa",
                      imageCredit: "",
                    }),
                    imageUrl: value,
                  };
                })
              }
              media={media}
            />
            <TextField
              label="Alt text"
              value={content.pages.about.image?.imageAlt ?? ""}
              maxLength={200}
              onChange={(value) =>
                mutate((draft) => {
                  if (draft.pages.about.image)
                    draft.pages.about.image.imageAlt = value;
                })
              }
            />
            <TextField
              label="Credit"
              value={content.pages.about.image?.imageCredit ?? ""}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  if (draft.pages.about.image)
                    draft.pages.about.image.imageCredit = value;
                })
              }
            />
          </EditorGroup>
        </>
      );
    if (section === "shop")
      return (
        <>
          {pageEditor("shop")}
          <EditorGroup
            controlId="shop-categories"
            title="Category pages"
            description="Use {category} where the collection name should appear."
          >
            <TextField
              label="Category title template"
              value={content.pages.shop.categoryTitleTemplate}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.shop.categoryTitleTemplate = value;
                })
              }
            />
            <TextArea
              label="Category description template"
              value={content.pages.shop.categoryBodyTemplate}
              maxLength={500}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.shop.categoryBodyTemplate = value;
                })
              }
            />
          </EditorGroup>
        </>
      );
    if (section === "contact")
      return (
        <>
          {pageEditor("contact")}
          <EditorGroup title="Contact choices">
            <TextField
              label="Enquiry tab"
              value={content.pages.contact.sections.tabs.enquiryLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.tabs.enquiryLabel = value;
                })
              }
            />
            <TextField
              label="Direct contact tab"
              value={content.pages.contact.sections.tabs.directLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.tabs.directLabel = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup controlId="contact-enquiry" title="Enquiry guidance">
            <TextField
              label="Open status"
              value={content.pages.contact.sections.enquiry.openLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.openLabel = value;
                })
              }
            />
            <TextField
              label="Quote prompt"
              value={content.pages.contact.sections.enquiry.quotePromptTitle}
              maxLength={120}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.quotePromptTitle = value;
                })
              }
            />
            <TextArea
              label="Quote guidance"
              value={content.pages.contact.sections.enquiry.quotePromptBody}
              maxLength={600}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.quotePromptBody = value;
                })
              }
            />
            <TextField
              label="Process eyebrow"
              value={content.pages.contact.sections.enquiry.processEyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.processEyebrow = value;
                })
              }
            />
            <TextField
              label="Process title"
              value={content.pages.contact.sections.enquiry.processTitle}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.processTitle = value;
                })
              }
            />
            <TextArea
              label="Process introduction"
              value={content.pages.contact.sections.enquiry.processBody}
              maxLength={600}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.enquiry.processBody = value;
                })
              }
            />
            {content.pages.contact.sections.enquiry.steps.map((step, index) => (
              <div className="website-field-pair" key={index}>
                <TextField
                  label={`Step ${index + 1}`}
                  value={step.title}
                  onChange={(value) =>
                    mutate((draft) => {
                      draft.pages.contact.sections.enquiry.steps[index].title =
                        value;
                    })
                  }
                />
                <TextArea
                  label={`Step ${index + 1} description`}
                  value={step.body}
                  maxLength={600}
                  onChange={(value) =>
                    mutate((draft) => {
                      draft.pages.contact.sections.enquiry.steps[index].body =
                        value;
                    })
                  }
                />
              </div>
            ))}
          </EditorGroup>
          <EditorGroup controlId="contact-direct" title="Direct contact">
            <TextField
              label="Eyebrow"
              value={content.pages.contact.sections.direct.eyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.eyebrow = value;
                })
              }
            />
            <TextField
              label="Heading"
              value={content.pages.contact.sections.direct.title}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.title = value;
                })
              }
            />
            <TextArea
              label="Description"
              value={content.pages.contact.sections.direct.body}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.body = value;
                })
              }
            />
            <TextField
              label="Details heading"
              value={content.pages.contact.sections.direct.detailsEyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.detailsEyebrow = value;
                })
              }
            />
            <TextField
              label="Reply label"
              value={content.pages.contact.sections.direct.repliesLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.repliesLabel = value;
                })
              }
            />
            <TextField
              label="Reply description"
              value={content.pages.contact.sections.direct.repliesValue}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.repliesValue = value;
                })
              }
            />
            <TextField
              label="Helpful tip title"
              value={content.pages.contact.sections.direct.tipTitle}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.tipTitle = value;
                })
              }
            />
            <TextArea
              label="Helpful tip"
              value={content.pages.contact.sections.direct.tipBody}
              maxLength={600}
              onChange={(value) =>
                mutate((draft) => {
                  draft.pages.contact.sections.direct.tipBody = value;
                })
              }
            />
          </EditorGroup>
        </>
      );
    if (section === "storeCopy") {
      const product = content.copy.product;
      const cart = content.copy.cart;
      const notFound = content.copy.notFound;
      return (
        <>
          <EditorGroup
            title="Product pages"
            description="Customer-facing labels around product information and the add-to-cart experience. Availability and payment safety messages remain protected."
          >
            <TextField
              label="Format label"
              value={product.formatLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.formatLabel = value;
                })
              }
            />
            <TextField
              label="Format value"
              value={product.formatValue}
              maxLength={120}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.formatValue = value;
                })
              }
            />
            <TextField
              label="Availability label"
              value={product.availabilityLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.availabilityLabel = value;
                })
              }
            />
            <TextField
              label="Shipping label"
              value={product.shippingLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.shippingLabel = value;
                })
              }
            />
            <TextField
              label="Add button"
              value={product.addLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.addLabel = value;
                })
              }
            />
            <TextField
              label="Add another button"
              value={product.addAnotherLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.addAnotherLabel = value;
                })
              }
            />
            <TextField
              label="Added heading"
              value={product.addedTitle}
              maxLength={100}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.addedTitle = value;
                })
              }
            />
            <TextField
              label="Added message"
              value={product.addedBody}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.addedBody = value;
                })
              }
            />
            <TextField
              label="Go to cart link"
              value={product.goToCartLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.goToCartLabel = value;
                })
              }
            />
            <TextField
              label="Related-products eyebrow"
              value={product.relatedEyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.relatedEyebrow = value;
                })
              }
            />
            <TextField
              label="Related title"
              hint="Use {category} where the collection name should appear."
              value={product.relatedTitleTemplate}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.relatedTitleTemplate = value;
                })
              }
            />
            <TextField
              label="Related collection link"
              value={product.relatedActionLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.product.relatedActionLabel = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup title="Cart">
            <TextField
              label="Search title"
              value={cart.seoTitle}
              maxLength={120}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.seoTitle = value;
                })
              }
            />
            <TextField
              label="Hero eyebrow"
              value={cart.heroEyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.heroEyebrow = value;
                })
              }
            />
            <TextField
              label="Hero heading"
              value={cart.heroTitle}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.heroTitle = value;
                })
              }
            />
            <TextField
              label="Empty-cart heading"
              value={cart.emptyTitle}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.emptyTitle = value;
                })
              }
            />
            <TextArea
              label="Empty-cart message"
              value={cart.emptyBody}
              maxLength={500}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.emptyBody = value;
                })
              }
            />
            <TextField
              label="Browse button"
              value={cart.browseLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.browseLabel = value;
                })
              }
            />
            <TextField
              label="Unit-price suffix"
              value={cart.eachLabel}
              maxLength={40}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.eachLabel = value;
                })
              }
            />
            <TextField
              label="Remove item"
              value={cart.removeLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.removeLabel = value;
                })
              }
            />
            <TextField
              label="Clear cart"
              value={cart.clearLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.clearLabel = value;
                })
              }
            />
            <TextField
              label="Summary heading"
              value={cart.summaryTitle}
              maxLength={120}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.summaryTitle = value;
                })
              }
            />
            <TextField
              label="Subtotal label"
              value={cart.subtotalLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.subtotalLabel = value;
                })
              }
            />
            <TextField
              label="Shipping label"
              value={cart.shippingLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.shippingLabel = value;
                })
              }
            />
            <TextField
              label="Total label"
              value={cart.totalLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.cart.totalLabel = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup title="Page not found">
            <TextField
              label="Eyebrow"
              value={notFound.eyebrow}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.notFound.eyebrow = value;
                })
              }
            />
            <TextField
              label="Heading"
              value={notFound.title}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.notFound.title = value;
                })
              }
            />
            <TextArea
              label="Message"
              value={notFound.body}
              maxLength={600}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.notFound.body = value;
                })
              }
            />
            <TextField
              label="Home button"
              value={notFound.homeLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.notFound.homeLabel = value;
                })
              }
            />
            <TextField
              label="Shop button"
              value={notFound.shopLabel}
              maxLength={80}
              onChange={(value) =>
                mutate((draft) => {
                  draft.copy.notFound.shopLabel = value;
                })
              }
            />
          </EditorGroup>
        </>
      );
    }
    if (section === "header")
      return (
        <>
          <EditorGroup controlId="header-settings" title="Announcement bar">
            <Toggle
              label="Show announcement"
              description="Off by default. Turn it on only when there is something useful to tell visitors."
              checked={content.header.announcementEnabled}
              onChange={(checked) =>
                mutate((draft) => {
                  draft.header.announcementEnabled = checked;
                })
              }
            />
            <TextField
              label="Message"
              value={content.header.announcementText}
              maxLength={240}
              onChange={(value) =>
                mutate((draft) => {
                  draft.header.announcementText = value;
                })
              }
            />
            <TextField
              label="Link label"
              value={content.header.announcementLinkLabel}
              maxLength={60}
              onChange={(value) =>
                mutate((draft) => {
                  draft.header.announcementLinkLabel = value;
                })
              }
            />
            <TextField
              label="Link path"
              value={content.header.announcementLinkPath}
              maxLength={2048}
              onChange={(value) =>
                mutate((draft) => {
                  draft.header.announcementLinkPath = value;
                })
              }
              hint="Use /shop for this site or a full https:// address for another site."
            />
          </EditorGroup>
          <EditorGroup
            title="Primary navigation"
            description="Reorder, rename or hide public links. Use a site path or secure https:// address."
          >
            <div className="website-link-list">
              {content.navigation.primary.map((item, index) => (
                <div key={item.id}>
                  <TextField
                    label="Label"
                    value={item.label}
                    maxLength={60}
                    onChange={(value) =>
                      mutate((draft) => {
                        draft.navigation.primary[index].label = value;
                      })
                    }
                  />
                  <TextField
                    label="Path"
                    value={item.path}
                    maxLength={2048}
                    hint="Use /… for this site or a full https:// address."
                    onChange={(value) =>
                      mutate((draft) => {
                        draft.navigation.primary[index].path = value;
                      })
                    }
                  />
                  <Toggle
                    label="Visible"
                    checked={item.visible}
                    onChange={(checked) =>
                      mutate((draft) => {
                        draft.navigation.primary[index].visible = checked;
                      })
                    }
                  />
                  <span>
                    <button
                      aria-label={`Move ${item.label} up`}
                      disabled={index === 0}
                      onClick={() =>
                        mutate((draft) => {
                          draft.navigation.primary = move(
                            draft.navigation.primary,
                            index,
                            -1,
                          );
                        })
                      }
                    >
                      <ArrowUp />
                    </button>
                    <button
                      aria-label={`Move ${item.label} down`}
                      disabled={index === content.navigation.primary.length - 1}
                      onClick={() =>
                        mutate((draft) => {
                          draft.navigation.primary = move(
                            draft.navigation.primary,
                            index,
                            1,
                          );
                        })
                      }
                    >
                      <ArrowDown />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </EditorGroup>
        </>
      );
    if (section === "footer")
      return (
        <>
          <EditorGroup controlId="footer-settings" title="Footer introduction">
            <TextArea
              label="Description"
              value={content.footer.description}
              maxLength={320}
              onChange={(value) =>
                mutate((draft) => {
                  draft.footer.description = value;
                })
              }
            />
            <TextField
              label="Copyright text"
              value={content.footer.copyrightText}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.footer.copyrightText = value;
                })
              }
            />
          </EditorGroup>
          {content.footer.groups.map((group, groupIndex) => (
            <EditorGroup
              key={group.id}
              title={`Footer column ${groupIndex + 1}`}
            >
              <TextField
                label="Heading"
                value={group.heading}
                maxLength={60}
                onChange={(value) =>
                  mutate((draft) => {
                    draft.footer.groups[groupIndex].heading = value;
                  })
                }
              />
              <div className="website-link-list compact">
                {group.links.map((item, index) => (
                  <div key={item.id}>
                    <TextField
                      label="Label"
                      value={item.label}
                      maxLength={60}
                      onChange={(value) =>
                        mutate((draft) => {
                          draft.footer.groups[groupIndex].links[index].label =
                            value;
                        })
                      }
                    />
                    <TextField
                      label="Path"
                      value={item.path}
                      maxLength={2048}
                      hint="Use /… for this site or a full https:// address."
                      onChange={(value) =>
                        mutate((draft) => {
                          draft.footer.groups[groupIndex].links[index].path =
                            value;
                        })
                      }
                    />
                    <Toggle
                      label="Visible"
                      checked={item.visible}
                      onChange={(checked) =>
                        mutate((draft) => {
                          draft.footer.groups[groupIndex].links[index].visible =
                            checked;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </EditorGroup>
          ))}
        </>
      );
    if (section === "theme")
      return (
        <>
          <EditorGroup title="Typography">
            <label className="website-field">
              <span>Typography preset</span>
              <select
                value={content.theme.typography}
                onChange={(event) =>
                  mutate((draft) => {
                    draft.theme.typography = event.target
                      .value as WebsiteContent["theme"]["typography"];
                  })
                }
              >
                <option value="heritage">
                  Heritage — refined serif headings
                </option>
                <option value="classical">
                  Classical — traditional book typography
                </option>
                <option value="editorial">Editorial — serif throughout</option>
              </select>
            </label>
          </EditorGroup>
          <EditorGroup
            title="Colour palette"
            description="Every value is restricted to a six-digit HEX colour. Contrast indicators flag combinations that may be difficult to read."
          >
            <div className="website-colour-grid">
              {(
                Object.keys(content.theme.palette) as Array<
                  keyof WebsiteContent["theme"]["palette"]
                >
              ).map((token) => (
                <label key={token}>
                  <span>{token.replace(/([A-Z])/g, " $1")}</span>
                  <div>
                    <input
                      type="color"
                      value={content.theme.palette[token]}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.theme.palette[token] = event.target.value;
                        })
                      }
                    />
                    <input
                      value={content.theme.palette[token]}
                      maxLength={7}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.theme.palette[token] = event.target.value;
                        })
                      }
                    />
                  </div>
                </label>
              ))}
            </div>
            <div
              className="website-contrast-checks"
              aria-label="Colour contrast checks"
            >
              {(
                [
                  [
                    "Body text on page",
                    content.theme.palette.ink,
                    content.theme.palette.paper,
                  ],
                  [
                    "Muted text on surface",
                    content.theme.palette.muted,
                    content.theme.palette.surface,
                  ],
                  [
                    "Gold on dark brown",
                    content.theme.palette.goldLight,
                    content.theme.palette.brown,
                  ],
                ] as const
              ).map(([label, foreground, background]) => {
                const ratio = contrastRatio(foreground, background);
                const passes = ratio >= 4.5;
                return (
                  <span key={label} className={passes ? "pass" : "warning"}>
                    <i
                      style={{ color: foreground, background }}
                      aria-hidden="true"
                    >
                      Aa
                    </i>
                    <strong>{label}</strong>
                    <em>
                      {ratio.toFixed(1)}:1 ·{" "}
                      {passes ? "AA pass" : "Improve contrast"}
                    </em>
                  </span>
                );
              })}
            </div>
            <button
              className="button secondary"
              onClick={() =>
                mutate((draft) => {
                  draft.theme = cloneWebsiteContent(
                    defaultWebsiteContent,
                  ).theme;
                })
              }
            >
              <RotateCcw /> Restore default theme
            </button>
          </EditorGroup>
        </>
      );
    if (section === "branding")
      return (
        <>
          <EditorGroup controlId="branding-identity" title="Names & identity">
            <TextField
              label="Business name"
              value={content.branding.businessName}
              maxLength={100}
              onChange={(value) =>
                mutate((draft) => {
                  draft.branding.businessName = value;
                })
              }
            />
            <TextField
              label="Header name"
              value={content.branding.headerName}
              maxLength={100}
              onChange={(value) =>
                mutate((draft) => {
                  draft.branding.headerName = value;
                })
              }
            />
            <TextField
              label="Footer name"
              value={content.branding.footerName}
              maxLength={100}
              onChange={(value) =>
                mutate((draft) => {
                  draft.branding.footerName = value;
                })
              }
            />
            <TextArea
              label="Tagline"
              value={content.branding.tagline}
              maxLength={320}
              onChange={(value) =>
                mutate((draft) => {
                  draft.branding.tagline = value;
                })
              }
            />
            <TextField
              label="Public contact email"
              type="email"
              value={content.branding.publicContactEmail}
              maxLength={160}
              onChange={(value) =>
                mutate((draft) => {
                  draft.branding.publicContactEmail = value;
                })
              }
            />
          </EditorGroup>
          <EditorGroup controlId="branding-logo" title="Logo">
            <label className="website-field">
              <span>Display mode</span>
              <select
                value={content.theme.logo.mode}
                onChange={(event) =>
                  mutate((draft) => {
                    draft.theme.logo.mode = event.target
                      .value as WebsiteContent["theme"]["logo"]["mode"];
                  })
                }
              >
                <option value="monogram">Monogram and name</option>
                <option value="text">Text only</option>
                <option value="image">Uploaded logo</option>
              </select>
            </label>
            <TextField
              label="Monogram"
              value={content.theme.logo.monogram}
              maxLength={3}
              onChange={(value) =>
                mutate((draft) => {
                  draft.theme.logo.monogram = value;
                })
              }
            />
            <MediaField
              label="Logo image URL"
              value={content.theme.logo.imageUrl}
              onChange={(value) =>
                mutate((draft) => {
                  draft.theme.logo.imageUrl = value;
                })
              }
              media={media}
            />
            <TextField
              label="Logo alt text"
              value={content.theme.logo.imageAlt}
              maxLength={120}
              onChange={(value) =>
                mutate((draft) => {
                  draft.theme.logo.imageAlt = value;
                })
              }
            />
            <label className="button secondary website-upload-button">
              <Upload /> Upload logo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={upload}
              />
            </label>
          </EditorGroup>
        </>
      );
    if (section === "seo")
      return (
        <>
          <EditorGroup title="Site-wide search settings">
            <TextField
              label="Site title"
              value={content.seo.siteTitle}
              maxLength={100}
              onChange={(value) =>
                mutate((draft) => {
                  draft.seo.siteTitle = value;
                })
              }
            />
            <TextField
              label="Title template"
              value={content.seo.titleTemplate}
              maxLength={140}
              hint="Use %s where each page title should appear."
              onChange={(value) =>
                mutate((draft) => {
                  draft.seo.titleTemplate = value;
                })
              }
            />
            <TextArea
              label="Default description"
              value={content.seo.defaultDescription}
              maxLength={320}
              onChange={(value) =>
                mutate((draft) => {
                  draft.seo.defaultDescription = value;
                })
              }
            />
            <MediaField
              label="Default social image URL"
              value={content.seo.defaultSocialImageUrl}
              onChange={(value) =>
                mutate((draft) => {
                  draft.seo.defaultSocialImageUrl = value;
                })
              }
              media={media}
            />
          </EditorGroup>
          <div className="website-seo-list">
            {(["home", "about", "shop", "contact"] as WebsitePageId[]).map(
              (page) => (
                <button key={page} onClick={() => updatePage(page)}>
                  <span>
                    <strong>{page[0].toUpperCase() + page.slice(1)}</strong>
                    <small>{content.pages[page].seo.title}</small>
                  </span>
                  <ChevronRight />
                </button>
              ),
            )}
          </div>
        </>
      );
    if (section === "media")
      return (
        <>
          <EditorGroup
            title="Upload media"
            description="Images are privately staged, validated server-side, then published to a read-only public location."
          >
            <label className="website-media-drop">
              <Upload />
              <strong>
                {busy === "upload" ? "Validating image…" : "Upload an image"}
              </strong>
              <span>JPG, PNG or WebP · maximum 5 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy === "upload"}
                onChange={upload}
              />
            </label>
          </EditorGroup>
          <div className="website-media-toolbar">
            <label>
              <Search />
              <input
                type="search"
                placeholder="Search filenames"
                value={mediaSearch}
                onChange={(event) => setMediaSearch(event.target.value)}
              />
            </label>
            <span>{filteredMedia.length} images</span>
          </div>
          <div className="website-media-grid">
            {filteredMedia.map((item) => (
              <article key={`${item.path}-${item.generation}`}>
                <div>
                  {item.url ? (
                    <img src={item.url} alt="" loading="lazy" />
                  ) : (
                    <ImageIcon />
                  )}
                  <small>
                    {(item.contentType ?? "image")
                      .replace("image/", "")
                      .toUpperCase()}
                  </small>
                </div>
                <strong title={item.path}>{item.path.split("/").at(-1)}</strong>
                <span>
                  {Math.max(1, Math.round(item.size / 1024))} KB ·{" "}
                  {item.referenced
                    ? `Used in ${item.references.length} place${item.references.length === 1 ? "" : "s"}`
                    : "Unused"}
                </span>
                <div>
                  <button
                    disabled={!item.url}
                    onClick={() => {
                      if (!item.url) return;
                      void copyToClipboard(item.url).then((copied) => setMessage({
                        tone: copied ? "success" : "error",
                        text: copied
                          ? "Image URL copied to your clipboard."
                          : "Your browser did not allow clipboard access. The image is still safely uploaded.",
                      }));
                    }}
                  >
                    Copy URL
                  </button>
                  <button
                    className="danger"
                    disabled={
                      !item.deletionAvailable ||
                      busy === `media-${item.generation}`
                    }
                    title={
                      item.deletionAvailable
                        ? "Delete unused image"
                        : "Published or versioned images cannot be deleted"
                    }
                    onClick={() => void removeMedia(item)}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      );
    return (
      <div className="website-history-list">
        {versions.length === 0 ? (
          <div className="website-editor-empty">
            <Clock3 />
            <h3>No published versions yet</h3>
            <p>The first successful publish will appear here.</p>
          </div>
        ) : (
          versions.map((version, index) => (
            <article key={version.revision}>
              <span>
                <History />
              </span>
              <div>
                <strong>Revision {version.revision}</strong>
                <small>
                  {version.publishedAt
                    ? new Date(version.publishedAt).toLocaleString("en-AU")
                    : "Publication time unavailable"}{" "}
                  · by {version.publishedBy || "administrator"}
                </small>
              </div>
              {index === 0 &&
              version.revision === editorState.published?.revision ? (
                <em>Currently live</em>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy === `restore-${version.revision}`}
                  onClick={() => void restore(version.revision)}
                >
                  <RotateCcw /> Restore to draft
                </button>
              )}
            </article>
          ))
        )}
      </div>
    );
  };

  const activeLabel =
    sectionGroups
      .flatMap((group) => group.items)
      .find((item) => item.id === section)?.label ?? "Website Editor";
  const effectivePreviewPage = previewPage ?? "home";
  const viewportWidths: Record<Viewport, string> = {
    desktop: "Fluid desktop",
    tablet: "760 px",
    mobile: "390 px",
  };
  const editorStatus = busy === "save"
    ? { label: "Saving…", detail: "Saving changes to the private draft", tone: "saving" }
    : busy === "publish"
      ? { label: "Publishing…", detail: "Updating the public website", tone: "publishing" }
      : operationFailure === "save"
        ? { label: "Save failed", detail: "Your changes remain in this browser", tone: "error" }
        : operationFailure === "publish"
          ? { label: "Publish failed", detail: "The live website was not changed", tone: "error" }
          : dirty
            ? { label: "Unsaved changes", detail: "Save this draft before publishing", tone: "unsaved" }
            : unpublishedDraftChanges
              ? { label: "Unpublished draft changes", detail: "All changes saved to the private draft", tone: "draft" }
              : { label: "Published", detail: "All changes saved and live", tone: "live" };
  const chooseSection = (next: EditorSection) => {
    if (
      next === "home" ||
      next === "about" ||
      next === "shop" ||
      next === "contact"
    ) {
      updatePage(next);
      return;
    }
    setSection(next);
    setSelectedTarget("");
    if (next !== "overview" && !previewPage) setPreviewPage("home");
  };

  return (
    <div className={`website-editor-page${editorEntering ? " is-entering" : ""}`}>
      <PageMeta
        title="Website Editor — Admin"
        description="Edit and publish public website content and design."
      />
      <header className="website-editor-topbar">
        <div className="website-editor-title">
          <p className="eyebrow">Website</p>
          <h1>{section === "overview" ? "Website Editor" : activeLabel}</h1>
        </div>
        {section !== "overview" && (
          <div className="website-editor-preview-actions" role="group" aria-label="Preview controls">
            <div
              className="website-preview-devices"
              role="group"
              aria-label="Preview size"
            >
              {(
                [
                  ["desktop", Monitor, "Desktop preview"],
                  ["tablet", Tablet, "Tablet preview"],
                  ["mobile", Smartphone, "Mobile preview"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  className={viewport === id ? "active" : ""}
                  aria-label={label}
                  title={label}
                  aria-pressed={viewport === id}
                  onClick={() => setViewport(id)}
                >
                  <Icon />
                </button>
              ))}
            </div>
            <span className="website-preview-width" aria-live="polite" title="Current preview width">
              {viewportWidths[viewport]}
            </span>
            <button
              className="website-editor-icon-action"
              aria-label={previewFullscreen ? "Exit fullscreen preview" : "Fullscreen preview"}
              title={previewFullscreen ? "Exit fullscreen preview" : "Fullscreen preview"}
              aria-pressed={previewFullscreen}
              onClick={() => setPreviewFullscreen((current) => !current)}
            >
              {previewFullscreen ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button
              className="website-editor-icon-action"
              aria-label="Open saved draft preview in a new tab"
              title={dirty ? "Save the draft before opening it in a new tab" : "Open saved draft in a new tab"}
              disabled={dirty}
              onClick={() =>
                window.open(
                  `/admin/website/preview?page=${effectivePreviewPage}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ExternalLink />
            </button>
            <button
              className="website-editor-icon-action"
              aria-label={inspectorOpen ? "Hide properties" : "Show properties"}
              title={inspectorOpen ? "Hide properties" : "Show properties"}
              aria-expanded={inspectorOpen}
              onClick={() => setInspectorOpen((current) => !current)}
            >
              {inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
          </div>
        )}
        <div className="website-editor-actions">
          <div className="website-editor-status">
            <span className={editorStatus.tone}>{editorStatus.label}</span>
            <small title={`Private draft version ${editorState.draft.revision}; published version ${editorState.published?.revision ?? 0}. These are independent change counters.`}>
              {editorStatus.detail}
            </small>
          </div>
          <div className="website-editor-action-utilities" role="group" aria-label="Editor utilities">
            <button
              className="website-editor-icon-action"
              aria-label="Undo editor change"
              title="Undo (Ctrl/Cmd + Z)"
              disabled={undoStackRef.current.length === 0 || busy !== ""}
              onClick={undo}
            >
              <Undo2 />
            </button>
            <button
              className="website-editor-icon-action"
              aria-label="Redo editor change"
              title="Redo (Ctrl/Cmd + Shift + Z)"
              disabled={redoStackRef.current.length === 0 || busy !== ""}
              onClick={redo}
            >
              <Redo2 />
            </button>
            <button
              className="button secondary website-editor-revert-action"
              aria-label="Revert unsaved changes"
              title="Discard unsaved editor changes"
              disabled={!dirty || busy !== ""}
              onClick={() => {
                setContent(cloneWebsiteContent(editorState.draft.content));
                setBaseline(JSON.stringify(editorState.draft.content));
                undoStackRef.current = [];
                redoStackRef.current = [];
                setHistoryRevision((value) => value + 1);
                setOperationFailure("");
                setMessage({
                  tone: "info",
                  text: "Unsaved changes were reverted.",
                });
              }}
            >
              <X /> <span>Revert</span>
            </button>
          </div>
          <div className="website-editor-action-commit" role="group" aria-label="Draft and publishing actions">
            <button
              className="button secondary"
              aria-label={busy === "save" ? "Saving draft" : "Save draft"}
              title={busy === "save" ? "Saving draft" : "Save draft"}
              disabled={!dirty || busy !== ""}
              onClick={() => void saveDraft()}
            >
              <Save /> <span>{busy === "save" ? "Saving…" : "Save draft"}</span>
            </button>
            <button
              className="button primary"
              aria-label={busy === "publish" ? "Publishing website" : "Publish website"}
              title={busy === "publish" ? "Publishing website" : "Publish website"}
              disabled={
                dirty ||
                busy !== "" ||
                !unpublishedDraftChanges
              }
              onClick={() => void publish()}
            >
              <Send /> <span>{busy === "publish" ? "Publishing…" : "Publish"}</span>
            </button>
          </div>
        </div>
      </header>
      {message && (
        <div
          className={`website-editor-message ${message.tone}`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          <span>{message.text}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage(null)}>
            <X />
          </button>
        </div>
      )}
      <div
        className={`website-editor-workspace${section === "overview" ? " overview-mode" : ""}${inspectorOpen ? " inspector-open" : " inspector-collapsed"}`}
        style={{ "--editor-inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <aside className="website-editor-nav" aria-label="Website editor" data-testid="website-editor-nav">
          <div className="website-editor-nav-brand">
            <Settings2 />
            <span>
              <strong>Customise</strong>
              <small>Draft workspace</small>
            </span>
          </div>
          {sectionGroups.map((group) => (
            <div key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={section === id ? "active" : ""}
                  onClick={() => chooseSection(id)}
                >
                  <Icon />
                  <span>{label}</span>
                  {section === id && <i />}
                </button>
              ))}
            </div>
          ))}
        </aside>
        {section === "overview" ? (
          <main className="website-editor-overview-landing">
            <header>
              <p className="eyebrow">Website Editor</p>
              <h2>What would you like to edit?</h2>
              <p>Choose a page to start editing, or customise your website&apos;s appearance.</p>
            </header>
            <div className="website-editor-page-cards">
              {(
                [
                  ["home", LayoutTemplate, "Shape the homepage hero, featured collection and editorial sections."],
                  ["about", BookOpen, "Tell the story and purpose behind Doxa Treasury."],
                  ["shop", ShoppingBag, "Edit the shop introduction, category copy and search preview."],
                  ["contact", Mail, "Manage the contact introduction, enquiry guidance and direct-contact copy."],
                ] as const
              ).map(([page, Icon, description]) => (
                <button key={page} onClick={() => updatePage(page)}>
                  <span><Icon /></span>
                  <strong>{page[0].toUpperCase() + page.slice(1)}</strong>
                  <small>{description}</small>
                  <em>Edit Page <ChevronRight /></em>
                </button>
              ))}
            </div>
            <section className="website-editor-shortcuts" aria-labelledby="website-editor-shortcuts-title">
              <div>
                <p className="eyebrow">Site-wide settings</p>
                <h3 id="website-editor-shortcuts-title">Customise your website</h3>
              </div>
              <div>
                {(
                  [
                    ["header", PanelTop, "Header & navigation"],
                    ["footer", LayoutTemplate, "Footer"],
                    ["theme", Palette, "Theme & colours"],
                    ["branding", Type, "Branding"],
                    ["seo", Search, "SEO"],
                    ["media", Images, "Media library"],
                    ["history", History, "Publishing history"],
                  ] as const
                ).map(([id, Icon, label]) => (
                  <button key={id} onClick={() => chooseSection(id)}>
                    <Icon /><span>{label}</span><ChevronRight />
                  </button>
                ))}
              </div>
            </section>
          </main>
        ) : (
          <>
            <section className={`website-editor-canvas${previewFullscreen ? " fullscreen" : ""}`} aria-label="Draft preview">
              <header>
                <div>
                  <strong>Draft preview</strong>
                  <small>{viewportWidths[viewport]} · Click an outlined area to edit it</small>
                </div>
                <div className="website-editor-canvas-tools">
                  <details className="website-section-navigator">
                    <summary>Sections</summary>
                    <div>
                      {targetsForPage(effectivePreviewPage).map((target) => (
                        <button
                          key={target.id}
                          className={selectedTarget === target.id ? "active" : ""}
                          onClick={() => selectPreviewTarget(target.id, true)}
                        >
                          <span>{target.breadcrumb}</span>
                          <ChevronRight aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </details>
                  <label>
                    Preview page
                    <select
                      value={effectivePreviewPage}
                      onChange={(event) => {
                        setPreviewPage(event.target.value as WebsitePageId);
                        setSelectedTarget("");
                      }}
                    >
                      {(["home", "about", "shop", "contact"] as WebsitePageId[]).map((page) => (
                        <option key={page} value={page}>{page[0].toUpperCase() + page.slice(1)}</option>
                      ))}
                    </select>
                  </label>
                  {previewFullscreen && (
                    <>
                      <div className="website-preview-devices" role="group" aria-label="Fullscreen preview size">
                        {(["desktop", "tablet", "mobile"] as Viewport[]).map((id) => (
                          <button key={id} className={viewport === id ? "active" : ""} aria-label={`${id} preview`} aria-pressed={viewport === id} onClick={() => setViewport(id)}>
                            {id === "desktop" ? <Monitor /> : id === "tablet" ? <Tablet /> : <Smartphone />}
                          </button>
                        ))}
                      </div>
                      <button className="website-editor-fullscreen-close" onClick={() => setPreviewFullscreen(false)}><Minimize2 /> Exit preview</button>
                    </>
                  )}
                </div>
              </header>
              <div className={`website-preview-shell ${viewport}`} data-viewport={viewport} data-testid="website-preview-scroll">
                <div className="website-preview-real-site">
                  <WebsiteDraftPreview
                    content={content}
                    page={effectivePreviewPage}
                    selectedTarget={selectedTarget}
                    onSelect={selectPreviewTarget}
                  />
                </div>
              </div>
            </section>
            {inspectorOpen && (
              <>
                <div
                  className="website-editor-resizer"
                  role="separator"
                  aria-label="Resize properties panel"
                  aria-orientation="vertical"
                  aria-valuemin={340}
                  aria-valuemax={680}
                  aria-valuenow={inspectorWidth}
                  tabIndex={0}
                  onMouseDown={resizeInspector}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    setInspectorWidth((current) => Math.min(680, Math.max(340, current + (event.key === "ArrowLeft" ? 20 : -20))));
                  }}
                />
                <aside
                  className="website-editor-inspector"
                  aria-label="Properties"
                  onFocusCapture={(event) => {
                    if ((event.target as HTMLElement).matches("input, textarea, select, [contenteditable='true']")) {
                      editSessionRef.current = { active: true, recorded: false };
                    }
                  }}
                  onBlurCapture={(event) => {
                    if ((event.target as HTMLElement).matches("input, textarea, select, [contenteditable='true']")) {
                      editSessionRef.current = { active: false, recorded: false };
                    }
                  }}
                >
                  <header>
                    <div>
                      <small>{selectedDefinition?.breadcrumb ?? activeLabel}</small>
                      <h2>{selectedDefinition?.label.replace(/^Edit /, "") ?? (section === "theme" ? "Design system" : activeLabel)}</h2>
                    </div>
                    {selectedDefinition && (
                      <button className="website-editor-clear-selection" aria-label="Clear selected element" title="Clear selection" onClick={() => setSelectedTarget("")}><X /></button>
                    )}
                    <button aria-label="Close properties panel" onClick={() => setInspectorOpen(false)}><X /></button>
                  </header>
                  <div className="website-editor-scroll" ref={inspectorScrollRef} data-testid="website-properties-scroll">
                    <EditorSelectionContext.Provider value={selectedDefinition?.controlId ?? null}>
                      {renderInspector()}
                    </EditorSelectionContext.Provider>
                  </div>
                </aside>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
