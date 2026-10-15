/** A page in the Folio page tree. */
export interface FolioPage {
  id: string;
  title: string;
  /** Emoji icon shown in the sidebar and title bar. */
  icon: string;
  /** Parent page id; null for top-level pages. */
  parentId: string | null;
  updatedAt: number;
}

/** Local identity for realtime presence. */
export interface FolioIdentity {
  name: string;
  color: string;
}
