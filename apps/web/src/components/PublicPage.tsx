import { useEffect, useState } from 'react';
import type { Doc as YDoc } from 'yjs';
import { ArrowLeft, EyeOff, FileQuestion, Moon, Sun } from 'lucide-react';
import { renderFragmentHtml } from '@folio/editor/render';
import { FOLIO_DOC_ROOT } from '@folio/sync/doc';
import { Button } from '@folio/ui/button';
import { getPageByPublicId } from '../sharing';
import type { FolioPage } from '../types';
import { ContentSkeleton } from './ContentSkeleton';

export interface PublicPageProps {
  publicId: string;
  pages: FolioPage[];
  getDoc: (id: string) => YDoc;
  /** Seed HTML for pages never opened in the editor this session. */
  seedHtmlFor: (pageId: string) => string | undefined;
  resolveAttachmentUrl: (attachmentId: string) => string | null;
  dark: boolean;
  onToggleDark: () => void;
  /** Leave the public view and return to the workspace. */
  onExit: () => void;
}

function formatUpdatedAt(updatedAt: number): string {
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * PublicPage — the read-only published view at `#/p/<publicId>`.
 *
 * No sidebar, no editing, no editor instance: the page's Yjs fragment is
 * rendered to static HTML and re-rendered whenever the document changes, so
 * edits made in the workspace show up here live on this device. The document
 * title carries the page title for clean link previews.
 */
export function PublicPage({
  publicId,
  pages,
  getDoc,
  seedHtmlFor,
  resolveAttachmentUrl,
  dark,
  onToggleDark,
  onExit,
}: PublicPageProps) {
  const share = getPageByPublicId(publicId);
  const page = share ? (pages.find((candidate) => candidate.id === share.pageId) ?? null) : null;
  const [html, setHtml] = useState<string | null>(null);

  // Render the page's Yjs fragment as static HTML; stay live on updates.
  useEffect(() => {
    if (!page) return;
    const doc = getDoc(page.id);
    const fragment = doc.getXmlFragment(FOLIO_DOC_ROOT);
    const render = () =>
      setHtml(
        renderFragmentHtml(fragment, {
          seedHtml: seedHtmlFor(page.id),
          resolveAttachmentUrl,
        }),
      );
    render();
    doc.on('update', render);
    return () => {
      doc.off('update', render);
    };
  }, [page, getDoc, seedHtmlFor, resolveAttachmentUrl]);

  // Clean meta: the tab title is the page title.
  const pageTitle = page ? page.title.trim() || 'Untitled' : null;
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle ? `${pageTitle} · Folio` : 'Folio';
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);

  const notFoundCopy = !share
    ? {
        icon: <FileQuestion className="h-6 w-6 text-ink-soft" aria-hidden />,
        title: 'This link doesn’t match a published page',
        body: 'It may have been typed wrong, or the link is old. Ask the author for a fresh one.',
      }
    : !share.enabled
      ? {
          icon: <EyeOff className="h-6 w-6 text-ink-soft" aria-hidden />,
          title: 'This page is no longer published',
          body: 'The author turned publishing off. Ask them for a fresh link if you need access.',
        }
      : {
          icon: <FileQuestion className="h-6 w-6 text-ink-soft" aria-hidden />,
          title: 'This page no longer exists',
          body: 'It was deleted from the workspace it was published from.',
        };

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      {/* Frosted reading header — the only chrome on the page. */}
      <header className="glass-strong z-40 shrink-0 border-b border-hairline">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5">
          <span className="font-display text-lg text-ink">Folio</span>
          <span className="rounded-full border border-hairline px-2.5 py-0.5 font-sans text-xs text-ink-soft">
            Published page
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={onToggleDark}
            >
              {dark ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <Button variant="primary" size="sm" onClick={onExit}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Open in Folio
            </Button>
          </div>
        </div>
      </header>

      <main className="folio-scroll min-h-0 flex-1 overflow-y-auto">
        {!page ? (
          <div className="flex min-h-full items-center justify-center px-6 py-16">
            <div className="glass-strong w-full max-w-md rounded-card border border-hairline p-8 text-center shadow-glass">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
                {notFoundCopy.icon}
              </div>
              <h1 className="mt-4 font-display text-2xl text-ink">{notFoundCopy.title}</h1>
              <p className="mt-2 font-sans text-sm leading-relaxed text-ink-soft">
                {notFoundCopy.body}
              </p>
              <Button variant="primary" className="mt-6" onClick={onExit}>
                Back to Folio
              </Button>
            </div>
          </div>
        ) : (
          <article className="folio-enter-content mx-auto w-full max-w-3xl px-6 pb-24 pt-12 md:px-10 md:pt-16">
            <div className="text-5xl leading-none" aria-hidden>
              {page.icon}
            </div>
            <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight text-ink md:text-5xl">
              {pageTitle}
            </h1>
            <p className="mt-3 font-sans text-sm text-ink-soft">
              Published with Folio · Updated {formatUpdatedAt(page.updatedAt)}
            </p>
            <hr className="my-8 border-hairline" />
            {html === null ? (
              <ContentSkeleton />
            ) : (
              <div
                className="folio-prosemirror"
                // Static HTML from the page's own Yjs document — no editor, no interactivity.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
            <footer className="mt-16 border-t border-hairline pt-6 text-center">
              <p className="font-sans text-xs text-ink-faint">
                Published with Folio — a free, open-source Notion alternative
              </p>
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
