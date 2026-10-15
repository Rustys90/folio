import type { FolioPage } from '../types';

/**
 * Seed workspace — real starter content, no lorem ipsum.
 * Content bodies are seeded into each page's Yjs document on first open
 * (see App.tsx); titles live here.
 */
export const seedPages: FolioPage[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: '👋',
    parentId: null,
    updatedAt: Date.now(),
  },
  {
    id: 'design-notes',
    title: 'Design notes',
    icon: '🎨',
    parentId: null,
    updatedAt: Date.now(),
  },
  {
    id: 'design-tokens',
    title: 'Tokens',
    icon: '🎛️',
    parentId: 'design-notes',
    updatedAt: Date.now(),
  },
  {
    id: 'roadmap',
    title: 'Roadmap',
    icon: '🗺️',
    parentId: null,
    updatedAt: Date.now(),
  },
];

/** Initial HTML per page, written into the Yjs doc the first time a page opens. */
export const seedContent: Record<string, string> = {
  'getting-started': `
    <h2>Welcome to Folio</h2>
    <p>This is your workspace. Everything here is a <strong>block</strong> — select any
    block to see what you can do with it.</p>
    <h3>Try the blocks</h3>
    <ul>
      <li>Type <code>#</code> then space for a heading</li>
      <li>Type <code>-</code> or <code>1.</code> then space for lists</li>
      <li>Type <code>&gt;</code> then space for a quote</li>
      <li>Type <code>&gt;&gt;</code> then space for a toggle</li>
      <li>Type <code>\`\`\`</code> for a code block</li>
    </ul>
    <blockquote><p>Everything you write is saved locally first. Sync is a bonus, not a requirement.</p></blockquote>
    <h3>Pages</h3>
    <p>Pages nest inside pages. Hover the sidebar and press <strong>+</strong> to add one anywhere.</p>
  `,
  'design-notes': `
    <h2>How Folio looks</h2>
    <p>Folio's interface is built from a single token system — every color, radius and
    motion value comes from <code>packages/ui/src/tokens.css</code>. No hardcoded values.</p>
    <h3>The manuscript voice</h3>
    <p>Titles are set in a serif face, like a printed folio. Interface chrome stays in a
    quiet system sans. One memorable choice, everything else disciplined.</p>
  `,
  'design-tokens': `
    <h2>Tokens</h2>
    <p>Paper and ink, not pure white and black. Accent is a single manuscript blue.
    Surfaces that float — the sidebar, the top bar, menus — use frosted glass:
    translucency, blur, and a soft shadow for depth.</p>
    <ul>
      <li><code>--color-paper</code> / <code>--color-ink</code> — surfaces and text</li>
      <li><code>--color-accent</code> — the one interactive color</li>
      <li><code>--color-glass</code> — floating surfaces</li>
    </ul>
  `,
  roadmap: `
    <h2>Where Folio is going</h2>
    <ul>
      <li>Database views — tables and kanban boards</li>
      <li>Desktop app via Tauri</li>
      <li>Import from Notion and Markdown</li>
      <li>Mobile-friendly editing</li>
    </ul>
    <p>Follow along on <a href="https://github.com/Rustys90/folio">GitHub</a>.</p>
  `,
};
