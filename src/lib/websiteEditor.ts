import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { isFirebaseMode } from "../config";
import {
  defaultWebsiteContent,
  parseWebsiteContent,
  type WebsiteContent,
} from "../cms/websiteContent";
import { getFirebaseServices } from "./firebase";

export interface WebsiteRevision {
  revision: number;
  publishedAt: string | null;
  publishedBy: string | null;
}
export interface WebsiteEditorState {
  published: {
    revision: number;
    content: WebsiteContent;
    publishedAt: string | null;
  } | null;
  draft: {
    revision: number;
    basedOnPublishedRevision: number;
    content: WebsiteContent;
    updatedAt: string | null;
    restoredFromRevision?: number;
  };
}
export interface WebsiteMediaItem {
  path: string;
  size: number;
  contentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  generation: string;
  referenced: boolean;
  references: string[];
  deletionAvailable: boolean;
  url?: string;
}

export async function getPublishedWebsiteContent(): Promise<WebsiteContent | null> {
  if (!isFirebaseMode) return null;
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, "websiteContent", "published"));
  if (!snapshot.exists()) return null;
  return parseWebsiteContent(snapshot.data().content);
}

export async function getWebsiteContentEditorState(): Promise<WebsiteEditorState> {
  if (!isFirebaseMode)
    return {
      published: null,
      draft: {
        revision: 0,
        basedOnPublishedRevision: 0,
        content: structuredClone(defaultWebsiteContent),
        updatedAt: null,
      },
    };
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<Record<string, never>, WebsiteEditorState>(
      functions,
      "getWebsiteContentEditorState",
    )({})
  ).data;
}

export async function saveWebsiteContentDraft(
  expectedRevision: number,
  content: WebsiteContent,
) {
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<
      { expectedRevision: number; content: WebsiteContent },
      { revision: number; basedOnPublishedRevision: number }
    >(
      functions,
      "saveWebsiteContentDraft",
    )({ expectedRevision, content })
  ).data;
}

export async function publishWebsiteContent(
  expectedDraftRevision: number,
  expectedPublishedRevision: number,
) {
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<
      { expectedDraftRevision: number; expectedPublishedRevision: number },
      { publishedRevision: number; draftRevision: number }
    >(
      functions,
      "publishWebsiteContent",
    )({ expectedDraftRevision, expectedPublishedRevision })
  ).data;
}

export async function listWebsiteContentVersions() {
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<{ limit: number }, { versions: WebsiteRevision[] }>(
      functions,
      "listWebsiteContentVersions",
    )({ limit: 25 })
  ).data.versions;
}

export async function restoreWebsiteContentVersion(
  revision: number,
  expectedDraftRevision: number,
  expectedPublishedRevision: number,
) {
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<
      {
        revision: number;
        expectedDraftRevision: number;
        expectedPublishedRevision: number;
      },
      {
        draftRevision: number;
        basedOnPublishedRevision: number;
        restoredFromRevision: number;
      }
    >(
      functions,
      "restoreWebsiteContentVersion",
    )({ revision, expectedDraftRevision, expectedPublishedRevision })
  ).data;
}

export async function listWebsiteMedia() {
  const { functions, storage } = getFirebaseServices();
  const items = (
    await httpsCallable<
      { limit: number },
      { items: WebsiteMediaItem[]; nextPageToken?: string }
    >(
      functions,
      "listWebsiteMedia",
    )({ limit: 100 })
  ).data.items;
  return Promise.all(
    items.map(async (item) => {
      try {
        return { ...item, url: await getDownloadURL(ref(storage, item.path)) };
      } catch {
        return item;
      }
    }),
  );
}

export async function deleteWebsiteMedia(path: string, generation: string) {
  const { functions } = getFirebaseServices();
  return (
    await httpsCallable<
      { path: string; generation: string },
      { deleted: true }
    >(
      functions,
      "deleteWebsiteMedia",
    )({ path, generation })
  ).data;
}

export async function uploadWebsiteMedia(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP image smaller than 5 MB.");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-100);
  const { storage, functions, auth } = getFirebaseServices();
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Please sign in to continue.");
  // Administrator claims can change while a browser session remains open.
  // Refresh before Storage evaluates its claim-based staging rule.
  await auth.currentUser.getIdToken(true);
  const objectName =
    `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`.slice(-120);
  const stagingPath = `image-staging/${uid}/${objectName}`;
  await uploadBytes(ref(storage, stagingPath), file, {
    contentType: file.type,
  });
  const result = await httpsCallable<
    { stagingPath: string; destination: string },
    { path: string }
  >(
    functions,
    "publishStagedImage",
  )({ stagingPath, destination: `page-images/library/${objectName}` });
  if (!result.data.path.startsWith("page-images/library/"))
    throw new Error("The image service returned an invalid location.");
  return getDownloadURL(ref(storage, result.data.path));
}
