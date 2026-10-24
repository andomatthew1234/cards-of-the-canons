import { ExternalLink, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useLocation } from "react-router-dom";
import type { WebsiteContent, WebsitePageId } from "../../cms/websiteContent";
import { Layout } from "../../components/Layout";
import { SiteContentPreviewProvider } from "../../context/SiteContentContext";
import { getWebsiteContentEditorState } from "../../lib/websiteEditor";
import { About } from "../About";
import { Contact } from "../Contact";
import { Home } from "../Home";
import { Shop } from "../Shop";
import { websiteEditorTargetLabels } from "./websiteEditorTargets";

const pagePaths: Record<WebsitePageId, string> = {
  home: "/",
  about: "/about",
  shop: "/shop",
  contact: "/contact",
};

function PreviewPage({ page }: { page: WebsitePageId }) {
  if (page === "about") return <About previewMode />;
  if (page === "shop") return <Shop previewMode />;
  if (page === "contact") return <Contact previewMode />;
  return <Home previewMode />;
}

export function WebsiteDraftPreview({
  content,
  page,
  selectedTarget,
  onSelect,
}: {
  content: WebsiteContent;
  page: WebsitePageId;
  selectedTarget?: string;
  onSelect?: (target: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    surface?.querySelectorAll<HTMLElement>("[data-editor-target]").forEach((item) => {
      item.classList.remove("editor-selected");
      const target = item.dataset.editorTarget;
      if (target && websiteEditorTargetLabels[target]) item.dataset.editorLabel = websiteEditorTargetLabels[target];
    });
    if (!selectedTarget) return;
    surface
      ?.querySelector<HTMLElement>(`[data-editor-target="${selectedTarget}"]`)
      ?.classList.add("editor-selected");
  }, [content, page, selectedTarget]);
  const intercept = (event: MouseEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement;
    const editable = element.closest<HTMLElement>("[data-editor-target]");
    if (editable?.dataset.editorTarget && onSelect) {
      event.preventDefault();
      event.stopPropagation();
      onSelect(editable.dataset.editorTarget);
      return;
    }
    if (element.closest("a,button,input,select,textarea,label")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const stopSubmit = (event: FormEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const stopAuxiliaryAction = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a,button,input,select,textarea,label")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const stopKeyboardAction = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(["Enter", " "].includes(event.key))) return;
    if ((event.target as HTMLElement).closest("a,button,input,select,textarea,label")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <SiteContentPreviewProvider content={content}>
      <div
        ref={surfaceRef}
        className="website-draft-preview-surface"
        data-editor-interaction="enabled"
        data-selected-target={selectedTarget || undefined}
        onClickCapture={intercept}
        onAuxClickCapture={stopAuxiliaryAction}
        onKeyDownCapture={stopKeyboardAction}
        onSubmitCapture={stopSubmit}
      >
        <Layout previewMode previewPath={pagePaths[page]}>
          <PreviewPage page={page} />
        </Layout>
      </div>
    </SiteContentPreviewProvider>
  );
}

export function WebsiteDraftPreviewPage() {
  const { search } = useLocation();
  const requested = new URLSearchParams(search).get("page");
  const page: WebsitePageId =
    requested === "about" || requested === "shop" || requested === "contact"
      ? requested
      : "home";
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getWebsiteContentEditorState()
      .then((state) => {
        if (active) setContent(state.draft.content);
      })
      .catch(() => {
        if (active)
          setError("The saved draft preview could not be opened. Return to the editor and try again.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error)
    return (
      <main className="website-preview-window-state">
        <h1>Draft preview unavailable</h1>
        <p>{error}</p>
        <button className="button secondary" onClick={() => window.close()}>
          Close preview
        </button>
      </main>
    );
  if (!content)
    return (
      <main className="website-preview-window-state" role="status">
        <span className="spin" />
        <h1>Opening saved draft</h1>
      </main>
    );

  return (
    <div className="website-preview-window">
      <div className="website-preview-window-bar">
        <span><ExternalLink /> Saved draft preview</span>
        <strong>{page[0].toUpperCase() + page.slice(1)}</strong>
        <button onClick={() => window.close()} aria-label="Close preview window">
          <X />
        </button>
      </div>
      <WebsiteDraftPreview content={content} page={page} />
    </div>
  );
}
