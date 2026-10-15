import { getHTMLFromFragment, getSchema } from '@tiptap/core';
import { DOMParser } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import type { XmlFragment } from 'yjs';
import { FolioComments, FolioImage, FolioToggle } from './extensions';
import type { FolioImageOptions } from './extensions';

export interface RenderFragmentOptions {
  /**
   * HTML written into the fragment when it is empty, before rendering.
   * Mirrors FolioEditor's `initialHtml` contract (seed content, never an
   * overwrite) — used so a published page renders even if it was never
   * opened in the editor this session.
   */
  seedHtml?: string;
  /**
   * Resolves attachment ids to displayable URLs for `folioImage` blocks.
   * Omit when the host has no attachment store — images render as quiet
   * placeholders instead of broken images.
   */
  resolveAttachmentUrl?: FolioImageOptions['resolveAttachmentUrl'];
}

/**
 * The Folio block schema, shared with the editor. Kept in one place so the
 * static renderer and the live editor can never disagree about node types.
 */
function folioExtensions(resolveAttachmentUrl?: FolioImageOptions['resolveAttachmentUrl']) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      history: false,
    }),
    FolioToggle,
    FolioComments,
    FolioImage.configure({ resolveAttachmentUrl: resolveAttachmentUrl ?? (() => null) }),
  ];
}

/**
 * Render a Folio Yjs fragment to static HTML.
 *
 * No editor instance, no DOM views: the fragment is converted to a
 * ProseMirror tree with the Folio schema (via y-prosemirror) and serialized
 * with TipTap's DOM serializer — the same `renderHTML` path `getHTML()` uses,
 * so custom blocks (toggles, images) render identically to the editor.
 *
 * Pure read except for one case: when the fragment is empty and `seedHtml`
 * is given, the seed is imported into the fragment first. This is the only
 * sanctioned write (y-prosemirror's `prosemirrorToYXmlFragment` is documented
 * for exactly this first-import case), and it matches what FolioEditor does
 * on first open.
 */
export function renderFragmentHtml(
  fragment: XmlFragment,
  options: RenderFragmentOptions = {},
): string {
  const schema = getSchema(folioExtensions(options.resolveAttachmentUrl));

  if (fragment.length === 0 && options.seedHtml) {
    const container = document.createElement('div');
    container.innerHTML = options.seedHtml;
    const pmDoc = DOMParser.fromSchema(schema).parse(container);
    prosemirrorToYXmlFragment(pmDoc, fragment);
  }

  const root = yXmlFragmentToProseMirrorRootNode(fragment, schema);
  return getHTMLFromFragment(root.content, schema);
}
