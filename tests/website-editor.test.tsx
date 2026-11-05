import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import { cloneWebsiteContent, defaultWebsiteContent } from "../src/cms/websiteContent";
import * as editorApi from "../src/lib/websiteEditor";
import { WebsiteEditorPage } from "../src/pages/admin/WebsiteEditorPage";

configure({ asyncUtilTimeout: 16_000 });
vi.setConfig({ testTimeout: 20_000 });

vi.mock("../src/lib/websiteEditor", () => ({
  getPublishedWebsiteContent: vi.fn(),
  getWebsiteContentEditorState: vi.fn(),
  listWebsiteContentVersions: vi.fn(),
  listWebsiteMedia: vi.fn(),
  saveWebsiteContentDraft: vi.fn(),
  publishWebsiteContent: vi.fn(),
  restoreWebsiteContentVersion: vi.fn(),
  uploadWebsiteMedia: vi.fn(),
  deleteWebsiteMedia: vi.fn(),
}));

vi.mock("../src/pages/admin/WebsiteDraftPreview", () => ({
  WebsiteDraftPreview: ({ page, onSelect, selectedTarget }: { page: string; onSelect?: (target: string) => void; selectedTarget?: string }) => (
    <div data-testid="real-storefront-preview" data-selected-target={selectedTarget}>
      {page} storefront
      <button onClick={() => onSelect?.("home-hero-heading")}>Select preview heading</button>
    </div>
  ),
}));

function editorState() {
  const content = cloneWebsiteContent(defaultWebsiteContent);
  return {
    published: {
      revision: 1,
      content,
      publishedAt: "2026-10-14T00:00:00.000Z",
    },
    draft: {
      revision: 1,
      basedOnPublishedRevision: 1,
      content,
      updatedAt: "2026-10-14T00:00:00.000Z",
    },
  };
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <WebsiteEditorPage />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Website Editor workspace", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.mocked(editorApi.getWebsiteContentEditorState)
      .mockReset()
      .mockResolvedValue(editorState());
    vi.mocked(editorApi.getPublishedWebsiteContent)
      .mockReset()
      .mockResolvedValue(cloneWebsiteContent(defaultWebsiteContent));
    vi.mocked(editorApi.listWebsiteContentVersions)
      .mockReset()
      .mockResolvedValue([]);
    vi.mocked(editorApi.listWebsiteMedia).mockReset().mockResolvedValue([]);
    vi.mocked(editorApi.uploadWebsiteMedia)
      .mockReset()
      .mockResolvedValue("https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/page-images%2Flibrary%2Ffront-card.webp?alt=media&token=test");
    vi.mocked(editorApi.saveWebsiteContentDraft)
      .mockReset()
      .mockResolvedValue({ revision: 2, basedOnPublishedRevision: 1 });
    vi.mocked(editorApi.publishWebsiteContent)
      .mockReset()
      .mockResolvedValue({ publishedRevision: 2, draftRevision: 2 });
  });

  it("opens on a dedicated Overview without preloading the Home editor", async () => {
    renderEditor();
    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose a page to start editing, or customise your website's appearance.")).toBeInTheDocument();
    expect(screen.getByText("Shape the homepage hero, featured collection and editorial sections.")).toBeInTheDocument();
    expect(screen.getByText("Tell the story and purpose behind Doxa Treasury.")).toBeInTheDocument();
    expect(screen.getByText("Manage the contact introduction, enquiry guidance and direct-contact copy.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Draft preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Properties" })).not.toBeInTheDocument();
  });

  it("shows real editor startup stages while the primary content request is pending", async () => {
    const request = deferred<ReturnType<typeof editorState>>();
    vi.mocked(editorApi.getWebsiteContentEditorState).mockImplementationOnce(
      () => request.promise,
    );
    renderEditor();

    expect(await screen.findByRole("heading", { name: "Getting everything ready" })).toBeInTheDocument();
    expect(await screen.findByText("Fetching your editable website content…")).toBeInTheDocument();

    request.resolve(editorState());
    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loaded 4 editable pages and shared site settings.")).not.toBeInTheDocument();
  });

  it("shows a safe stage-specific retry state when opening content fails", async () => {
    const reportStartupFailure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(editorApi.getWebsiteContentEditorState).mockRejectedValueOnce(
      new Error("private backend error"),
    );
    renderEditor();

    expect(
      await screen.findByRole("heading", {
        name: "We couldn't finish opening the Website Editor.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading current page content…")).toBeInTheDocument();
    expect(screen.getByText("We couldn't complete this step.")).toBeInTheDocument();
    expect(screen.queryByText("private backend error")).not.toBeInTheDocument();
    expect(reportStartupFailure).toHaveBeenCalledWith(
      "Website Editor startup failed.",
      expect.any(Error),
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    expect(editorApi.getWebsiteContentEditorState).toHaveBeenCalledTimes(2);
    reportStartupFailure.mockRestore();
  });

  it("does not block opening the editor on the history or media library", async () => {
    const history = deferred<never[]>();
    const library = deferred<never[]>();
    vi.mocked(editorApi.listWebsiteContentVersions).mockImplementationOnce(
      () => history.promise,
    );
    vi.mocked(editorApi.listWebsiteMedia).mockImplementationOnce(
      () => library.promise,
    );
    renderEditor();

    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    expect(editorApi.listWebsiteContentVersions).toHaveBeenCalledTimes(1);
    expect(editorApi.listWebsiteMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      history.resolve([]);
      library.resolve([]);
      await Promise.resolve();
    });
  });

  it("uploads an image to Media Library without asking for a URL slug and refreshes the library", async () => {
    const uploadedItem = {
      path: "page-images/library/1790000000000-a1b2c3d4-front-card.webp",
      size: 2048,
      contentType: "image/webp",
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z",
      generation: "1",
      referenced: false,
      references: [],
      deletionAvailable: true,
      url: "https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/page-images%2Flibrary%2Ffront-card.webp?alt=media&token=test",
    };
    vi.mocked(editorApi.listWebsiteMedia)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([uploadedItem]);

    renderEditor();
    expect(await screen.findByRole("heading", { name: "What would you like to edit?" })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Media library" })[0]);

    const image = new File(["image bytes"], "front-card.webp", { type: "image/webp" });
    await userEvent.upload(screen.getByLabelText(/Upload an image/), image);

    await waitFor(() => expect(editorApi.uploadWebsiteMedia).toHaveBeenCalledWith(image));
    await waitFor(() => expect(editorApi.listWebsiteMedia).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("1790000000000-a1b2c3d4-front-card.webp")).toBeInTheDocument();
    expect(screen.queryByText(/URL slug/i)).not.toBeInTheDocument();
  });

  it("shows the publishing checkpoints, records the release and reloads after continuing", async () => {
    const state = editorState();
    state.draft.revision = 2;
    state.draft.content = cloneWebsiteContent(state.draft.content);
    state.draft.content.pages.home.title = "A ready-to-publish title";
    vi.mocked(editorApi.getWebsiteContentEditorState).mockResolvedValue(state);
    vi.mocked(editorApi.getPublishedWebsiteContent).mockResolvedValue(
      cloneWebsiteContent(state.draft.content),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor();

    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish website" }));

    expect(await screen.findByRole("heading", { name: "Site published!" })).toBeInTheDocument();
    expect(screen.getByText("Preparing published content…")).toBeInTheDocument();
    expect(screen.getByText("Uploading new code…")).toBeInTheDocument();
    expect(screen.getByText("No application-code upload is required for this content-only release.")).toBeInTheDocument();
    expect(editorApi.publishWebsiteContent).toHaveBeenCalledWith(2, 1);

    await userEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(
      await screen.findByRole("heading", { name: "What would you like to edit?" }),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("opens Home with independent preview and properties controls", async () => {
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);

    expect(screen.getByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Draft preview" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument();
    expect(screen.getByTestId("website-preview-scroll")).toHaveAttribute("data-viewport", "desktop");
    expect(screen.getByTestId("website-properties-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("website-editor-nav")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tablet preview" }));
    expect(screen.getByRole("button", { name: "Tablet preview" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("website-preview-scroll")).toHaveAttribute("data-viewport", "tablet");

    await userEvent.click(screen.getByRole("button", { name: "Hide properties" }));
    expect(screen.queryByRole("complementary", { name: "Properties" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Draft preview" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show properties" }));
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument();
  });

  it("saves a changed draft and keeps publishing explicit", async () => {
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);
    await userEvent.click(screen.getByRole("button", { name: "Open general page settings" }));
    const title = screen.getByDisplayValue(defaultWebsiteContent.pages.home.title);
    fireEvent.change(title, { target: { value: "A revised home title" } });
    expect(screen.getByRole("button", { name: "Publish website" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() =>
      expect(editorApi.saveWebsiteContentDraft).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          pages: expect.objectContaining({
            home: expect.objectContaining({ title: "A revised home title" }),
          }),
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Publish website" })).toBeEnabled();
  });

  it("selects preview elements contextually and focuses their field", async () => {
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);
    expect(screen.getByRole("heading", { name: "Select an element to edit" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Select preview heading" }));
    expect(screen.getAllByText("Home → Hero → Heading")).toHaveLength(2);
    const title = screen.getByDisplayValue(defaultWebsiteContent.pages.home.title);
    expect(title).toHaveFocus();
    expect(screen.queryByText("Search & social")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selected element" }));
    expect(screen.getByRole("heading", { name: "Select an element to edit" })).toBeInTheDocument();
  });

  it("undoes and redoes draft-only changes without publishing", async () => {
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);
    await userEvent.click(screen.getByRole("button", { name: "Open general page settings" }));
    const title = screen.getByDisplayValue(defaultWebsiteContent.pages.home.title);
    fireEvent.change(title, { target: { value: "A reversible title" } });
    await userEvent.click(screen.getByRole("button", { name: "Undo editor change" }));
    expect(screen.getByDisplayValue(defaultWebsiteContent.pages.home.title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Redo editor change" }));
    expect(screen.getByDisplayValue("A reversible title")).toBeInTheDocument();
    expect(editorApi.publishWebsiteContent).not.toHaveBeenCalled();
  });

  it("treats identical saved and live content as published even when revision counters differ", async () => {
    const state = editorState();
    state.draft.revision = 2;
    state.published.revision = 1;
    vi.mocked(editorApi.getWebsiteContentEditorState).mockResolvedValue(state);
    renderEditor();
    expect(await screen.findByText("Published")).toBeInTheDocument();
    expect(screen.getByText("All changes saved and live")).toBeInTheDocument();
  });

  it("opens only the saved draft in a separate tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);
    await userEvent.click(screen.getByRole("button", { name: "Open saved draft preview in a new tab" }));
    expect(open).toHaveBeenCalledWith(
      "/admin/website/preview?page=home",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.getByRole("heading", { name: "Home", level: 1 })).toBeInTheDocument();
    open.mockRestore();
  });

  it("supports section navigation and exits fullscreen with Escape", async () => {
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);

    await userEvent.click(screen.getByText("Sections"));
    await userEvent.click(
      screen.getByRole("button", { name: "Home → Hero → Heading" }),
    );
    expect(screen.getByTestId("real-storefront-preview")).toHaveAttribute(
      "data-selected-target",
      "home-hero-heading",
    );

    await userEvent.click(screen.getByRole("button", { name: "Fullscreen preview" }));
    expect(screen.getByRole("button", { name: "Exit preview" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Exit preview" })).not.toBeInTheDocument();
  });

  it("keeps unsaved changes visible when saving fails", async () => {
    vi.mocked(editorApi.saveWebsiteContentDraft).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    renderEditor();
    const description = await screen.findByText(
      "Shape the homepage hero, featured collection and editorial sections.",
    );
    await userEvent.click(description.closest("button")!);
    await userEvent.click(screen.getByRole("button", { name: "Open general page settings" }));
    fireEvent.change(screen.getByDisplayValue(defaultWebsiteContent.pages.home.title), {
      target: { value: "A title that still needs saving" },
    });
    await userEvent.click(screen.getByRole("button", { name: /Save draft/ }));

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
    expect(screen.getByText("Your changes remain in this browser")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A title that still needs saving")).toBeInTheDocument();
  });
});
