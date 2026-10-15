import { useState } from 'react';
import { ListFilter, Plus, X } from 'lucide-react';
import { Button } from '@folio/ui/button';
import {
  ModalRoot,
  ModalContent,
  ModalTitle,
  ModalDescription,
} from '@folio/ui/modal';
import { cn } from '@folio/ui/cn';
import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
} from '../database-types';
import { kanbanGroupProperty, newDbId, titleProperty } from '../database-types';
import { CellEditor, CellValueView, formatCellValue } from './database-cells';

const EMPTY_GROUP = '__none__';

export interface DatabaseKanbanProps {
  database: FolioDatabase;
  onChange: (db: FolioDatabase) => void;
}

/** Card title: the title property's value, or "Untitled". */
function cardTitle(db: FolioDatabase, row: DatabaseRow): string {
  const prop = titleProperty(db);
  if (!prop) return 'Untitled';
  const text = formatCellValue(prop, row.cells[prop.id]);
  return text || 'Untitled';
}

function KanbanCard({
  database,
  row,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  database: FolioDatabase;
  row: DatabaseRow;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const titleProp = titleProperty(database);
  const groupProp = kanbanGroupProperty(database);
  const shown = database.properties
    .filter((p) => p !== titleProp && p !== groupProp)
    .slice(0, 3);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      aria-label={`Edit card: ${cardTitle(database, row)}`}
      className={cn(
        'cursor-grab rounded-card border border-hairline bg-paper p-3 shadow-glass',
        'transition-all duration-quick ease-folio hover:border-accent/40 active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <p className="font-sans text-sm font-medium text-ink">
        {cardTitle(database, row)}
      </p>
      {shown.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {shown.map((prop) => (
            <div key={prop.id} className="flex items-center gap-2 font-sans text-xs">
              <span className="w-16 shrink-0 truncate text-ink-faint">
                {prop.name}
              </span>
              <span className="min-w-0 flex-1 text-ink-soft">
                <CellValueView property={prop} value={row.cells[prop.id]} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DatabaseKanban — cards grouped by a select property, draggable between
 * columns with native HTML5 drag-and-drop. Dropping a card on a column sets
 * the group property to that column's option.
 */
export function DatabaseKanban({ database, onChange }: DatabaseKanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const groupProp = kanbanGroupProperty(database);
  const selectProps = database.properties.filter((p) => p.type === 'select');

  const setCell = (rowId: string, propertyId: string, value: CellValue) => {
    onChange({
      ...database,
      rows: database.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [propertyId]: value } } : r,
      ),
      updatedAt: Date.now(),
    });
  };

  const addCard = (groupValue: string | undefined) => {
    if (!groupProp) return;
    const row: DatabaseRow = {
      id: newDbId('row'),
      cells: groupValue === undefined ? {} : { [groupProp.id]: groupValue },
    };
    onChange({ ...database, rows: [...database.rows, row], updatedAt: Date.now() });
    setEditingRowId(row.id);
  };

  const deleteRow = (rowId: string) => {
    onChange({
      ...database,
      rows: database.rows.filter((r) => r.id !== rowId),
      updatedAt: Date.now(),
    });
    setEditingRowId(null);
  };

  const handleDrop = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    const rowId = e.dataTransfer.getData('text/plain');
    setDropColumn(null);
    setDraggingId(null);
    if (!rowId || !groupProp) return;
    setCell(rowId, groupProp.id, columnKey === EMPTY_GROUP ? undefined : columnKey);
  };

  const editingRow = database.rows.find((r) => r.id === editingRowId) ?? null;

  // No usable group property — ask which select property to group by.
  if (!groupProp) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-card border border-hairline bg-paper-deep">
          <ListFilter className="h-5 w-5 text-ink-faint" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl text-ink">Group cards by a select column</h2>
          <p className="mt-1 max-w-sm font-sans text-sm text-ink-soft">
            Kanban columns come from a select property. Pick one, or add a select
            column in the table view.
          </p>
        </div>
        {selectProps.length > 0 ? (
          <select
            aria-label="Group by property"
            value=""
            onChange={(e) =>
              onChange({ ...database, kanbanGroupBy: e.target.value, updatedAt: Date.now() })
            }
            className="rounded-control border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink outline-none focus-visible:border-accent"
          >
            <option value="" disabled>
              Choose a property…
            </option>
            {selectProps.map((p: PropertyDef) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="font-sans text-sm text-ink-faint">
            This database has no select columns yet.
          </p>
        )}
      </div>
    );
  }

  const columns: { key: string; label: string | null }[] = [
    ...(groupProp.options ?? []).map((opt) => ({ key: opt, label: opt })),
    { key: EMPTY_GROUP, label: null },
  ];

  const rowsFor = (key: string) =>
    database.rows.filter((r) => {
      const v = r.cells[groupProp.id];
      const empty = v === undefined || v === '';
      return key === EMPTY_GROUP ? empty : v === key;
    });

  return (
    <div className="folio-scroll flex items-start gap-3 overflow-x-auto pb-6">
      {columns.map(({ key, label }) => {
        const rows = rowsFor(key);
        const isDropTarget = dropColumn === key;
        return (
          <section
            key={key}
            aria-label={label ?? 'No group'}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropColumn(key);
            }}
            onDragLeave={() => setDropColumn((d) => (d === key ? null : d))}
            onDrop={(e) => handleDrop(e, key)}
            className={cn(
              'w-72 shrink-0 rounded-card border p-2 transition-colors duration-quick ease-folio',
              isDropTarget
                ? 'border-accent bg-accent-soft/60'
                : 'border-hairline bg-paper-deep/60',
            )}
          >
            <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
              {label ? (
                <CellValueView property={groupProp} value={label} />
              ) : (
                <span className="font-sans text-xs font-medium text-ink-faint">
                  No status
                </span>
              )}
              <span className="font-sans text-xs tabular-nums text-ink-faint">
                {rows.length}
              </span>
              <button
                onClick={() => addCard(key === EMPTY_GROUP ? undefined : key)}
                aria-label={`Add card to ${label ?? 'No status'}`}
                title="Add card"
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-control text-ink-faint transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </header>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto folio-scroll px-0.5 pb-1">
              {rows.map((row) => (
                <KanbanCard
                  key={row.id}
                  database={database}
                  row={row}
                  dragging={draggingId === row.id}
                  onOpen={() => setEditingRowId(row.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', row.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingId(row.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropColumn(null);
                  }}
                />
              ))}
              {rows.length === 0 && (
                <p className="px-2 py-4 text-center font-sans text-xs text-ink-faint">
                  {isDropTarget ? 'Drop here' : 'No cards'}
                </p>
              )}
            </div>
          </section>
        );
      })}

      {/* Card editor */}
      <ModalRoot
        open={editingRow !== null}
        onOpenChange={(open) => !open && setEditingRowId(null)}
      >
        <ModalContent>
          <ModalTitle>{editingRow ? cardTitle(database, editingRow) : ''}</ModalTitle>
          <ModalDescription>Edit the card's properties.</ModalDescription>
          {editingRow && (
            <div className="mt-5 flex max-h-[50vh] flex-col gap-3 overflow-y-auto folio-scroll pr-1">
              {database.properties.map((prop) => (
                <label key={prop.id} className="block">
                  <span className="mb-1 block font-sans text-xs font-medium text-ink-faint">
                    {prop.name}
                  </span>
                  <CellEditor
                    property={prop}
                    value={editingRow.cells[prop.id]}
                    onCommit={(v) => setCell(editingRow.id, prop.id, v)}
                    onCancel={() => {}}
                    autoFocus={false}
                  />
                </label>
              ))}
              <div className="flex justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteRow(editingRow.id)}
                  className="text-red-600 dark:text-red-400"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Delete card
                </Button>
              </div>
            </div>
          )}
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
