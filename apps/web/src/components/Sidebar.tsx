import { useState } from 'react';
import { Search, Plus, ChevronRight, FileText, Table2 } from 'lucide-react';
import type { FolioPage } from '../types';
import type { FolioDatabase } from '../database-types';
import { cn } from '@folio/ui/cn';

export interface SidebarProps {
  pages: FolioPage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewPage: (parentId: string | null) => void;
  databases: FolioDatabase[];
  selectedDbId: string | null;
  onSelectDatabase: (id: string) => void;
  onNewDatabase: () => void;
}

interface TreeNode extends FolioPage {
  children: TreeNode[];
}

function buildTree(pages: FolioPage[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const page of pages) byId.set(page.id, { ...page, children: [] });
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function PageRow({
  node,
  depth,
  selectedId,
  onSelect,
  onNewPage,
  expanded,
  onToggleExpand,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewPage: (parentId: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        data-active={selectedId === node.id}
        className="folio-row group flex cursor-pointer items-center gap-1 rounded-control px-2 py-1.5 text-sm text-ink-soft"
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
        onClick={() => onSelect(node.id)}
        role="treeitem"
        aria-selected={selectedId === node.id}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        <button
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint',
            'transition-transform duration-quick ease-folio hover:bg-accent-soft hover:text-ink',
            !hasChildren && 'invisible',
          )}
          style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {node.icon}
        </span>
        <span className="flex-1 truncate">{node.title || 'Untitled'}</span>
        <button
          aria-label={`Add subpage to ${node.title}`}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-accent-soft hover:text-ink group-hover:flex"
          onClick={(e) => {
            e.stopPropagation();
            onNewPage(node.id);
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {hasChildren && expanded && (
        <div role="group">
          {node.children.map((child) => (
            <PageRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onNewPage={onNewPage}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar — workspace identity, search, and the page tree.
 * Search filters the tree live; the + button adds a top-level page.
 */
export function Sidebar({
  pages,
  selectedId,
  onSelect,
  onNewPage,
  databases,
  selectedDbId,
  onSelectDatabase,
  onNewDatabase,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(pages.map((p) => p.id)),
  );

  const visible =
    query.trim() === ''
      ? pages
      : pages.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()));
  const tree = buildTree(visible);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="folio-enter-sidebar glass flex h-full w-60 shrink-0 flex-col border-r border-hairline">
      {/* Workspace */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-ink font-display text-sm text-paper">
          F
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Folio</div>
          <div className="truncate text-xs text-ink-faint">Personal workspace</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-control border border-hairline bg-paper px-2.5 py-1.5 focus-within:border-accent">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages"
            aria-label="Search pages"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
      </div>

      {/* Page tree */}
      <nav
        aria-label="Pages"
        className="folio-scroll flex-1 overflow-y-auto px-2 pb-2"
      >
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <FileText className="h-6 w-6 text-ink-faint" aria-hidden />
            <p className="text-sm text-ink-soft">
              {query ? `No pages match “${query}”.` : 'No pages yet.'}
            </p>
            {!query && (
              <button
                className="text-sm font-medium text-accent hover:underline"
                onClick={() => onNewPage(null)}
              >
                Create your first page
              </button>
            )}
          </div>
        ) : (
          <div role="tree">
            {tree.map((node) => (
              <PageRow
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={onSelect}
                onNewPage={onNewPage}
                expanded={query.trim() !== '' || expandedIds.has(node.id)}
                onToggleExpand={() => toggleExpand(node.id)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* New page */}
      <div className="border-t border-hairline p-2">
        <button
          onClick={() => onNewPage(null)}
          className="folio-row flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-sm text-ink-soft"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New page
        </button>
      </div>

      {/* Databases */}
      <div className="px-2 pb-2 pt-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Databases
          </span>
          <button
            onClick={onNewDatabase}
            aria-label="New database"
            title="New database"
            className="flex h-6 w-6 items-center justify-center rounded-control text-ink-faint transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {databases.length === 0 ? (
          <p className="px-2 py-2 text-xs text-ink-faint">
            No databases yet.
          </p>
        ) : (
          <div role="list" aria-label="Databases">
            {databases.map((db) => (
              <div
                key={db.id}
                role="listitem"
              >
                <div
                  data-active={selectedDbId === db.id}
                  className="folio-row flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-sm text-ink-soft"
                  onClick={() => onSelectDatabase(db.id)}
                  role="treeitem"
                  aria-selected={selectedDbId === db.id}
                >
                  <span className="shrink-0 text-base leading-none" aria-hidden>
                    {db.icon}
                  </span>
                  <span className="flex-1 truncate">{db.title || 'Untitled'}</span>
                  <Table2
                    className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                    aria-hidden
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onNewDatabase}
          className="folio-row mt-1 flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-sm text-ink-soft"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New database
        </button>
      </div>
    </aside>
  );
}
