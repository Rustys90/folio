import { useState } from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@folio/ui/button';
import { cn } from '@folio/ui/cn';
import type { DatabaseRow, FolioDatabase } from '../database-types';
import { newDbId, titleProperty } from '../database-types';
import { CellValueView } from './database-cells';
import { DatabaseRowEditor, rowTitle } from './DatabaseRowEditor';

export interface DatabaseGalleryProps {
  database: FolioDatabase;
  /** Every database — relation and rollup cells resolve across this list. */
  databases: FolioDatabase[];
  onChange: (db: FolioDatabase) => void;
}

/** Deterministic hue (0–359) from a row id — stable cover gradients. */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 360;
  }
  return h;
}

/** Subtle two-stop gradient cover derived from the row id. No external images. */
function coverStyle(id: string): React.CSSProperties {
  const h = hueFor(id);
  return {
    background: `linear-gradient(135deg, hsl(${h} 55% 72% / 0.45), hsl(${(h + 48) % 360} 60% 58% / 0.35))`,
  };
}

function GalleryCard({
  database,
  databases,
  row,
  onOpen,
}: {
  database: FolioDatabase;
  databases: FolioDatabase[];
  row: DatabaseRow;
  onOpen: () => void;
}) {
  const titleProp = titleProperty(database);
  const shown = database.properties
    .filter((p) => p !== titleProp)
    .slice(0, 3);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      aria-label={`Edit card: ${rowTitle(database, row)}`}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-card border border-hairline bg-paper shadow-glass',
        'transition-all duration-quick ease-folio hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
      )}
    >
      <div className="relative h-24" style={coverStyle(row.id)} aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-t from-paper/40 to-transparent" />
      </div>
      <div className="p-4">
        <p className="truncate font-sans text-sm font-medium text-ink">
          {rowTitle(database, row)}
        </p>
        {shown.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {shown.map((prop) => (
              <div key={prop.id} className="flex items-center gap-2 font-sans text-xs">
                <span className="w-16 shrink-0 truncate text-ink-faint">
                  {prop.name}
                </span>
                <span className="min-w-0 flex-1 text-ink-soft">
                  <CellValueView
                    property={prop}
                    value={row.cells[prop.id]}
                    database={database}
                    databases={databases}
                    row={row}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * DatabaseGallery — responsive card grid. Each card gets a subtle cover
 * gradient derived from its row id; clicking a card opens the row editor.
 */
export function DatabaseGallery({ database, databases, onChange }: DatabaseGalleryProps) {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const addCard = () => {
    const row: DatabaseRow = { id: newDbId('row'), cells: {} };
    onChange({ ...database, rows: [...database.rows, row], updatedAt: Date.now() });
    setEditingRowId(row.id);
  };

  const editingRow = database.rows.find((r) => r.id === editingRowId) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="font-sans text-xs tabular-nums text-ink-faint">
          {database.rows.length} item{database.rows.length === 1 ? '' : 's'}
        </span>
        <Button variant="primary" size="sm" onClick={addCard} className="ml-auto">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New
        </Button>
      </div>

      {database.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-card border border-hairline bg-paper-deep">
            <LayoutGrid className="h-5 w-5 text-ink-faint" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-xl text-ink">No cards yet</h2>
            <p className="mt-1 max-w-sm font-sans text-sm text-ink-soft">
              Add your first card to start filling this gallery.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={addCard}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New card
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {database.rows.map((row) => (
            <GalleryCard
              key={row.id}
              database={database}
              databases={databases}
              row={row}
              onOpen={() => setEditingRowId(row.id)}
            />
          ))}
        </div>
      )}

      <DatabaseRowEditor
        database={database}
        databases={databases}
        row={editingRow}
        onClose={() => setEditingRowId(null)}
        onChange={onChange}
      />
    </div>
  );
}
