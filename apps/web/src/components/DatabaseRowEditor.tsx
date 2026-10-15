import { X } from 'lucide-react';
import { Button } from '@folio/ui/button';
import {
  ModalRoot,
  ModalContent,
  ModalTitle,
  ModalDescription,
} from '@folio/ui/modal';
import type { CellValue, DatabaseRow, FolioDatabase } from '../database-types';
import { titleProperty } from '../database-types';
import { CellEditor, formatCellValue } from './database-cells';

export interface DatabaseRowEditorProps {
  database: FolioDatabase;
  /** Null closes the editor. */
  row: DatabaseRow | null;
  onClose: () => void;
  onChange: (db: FolioDatabase) => void;
}

/** Card/row title: the title property's value, or "Untitled". */
export function rowTitle(db: FolioDatabase, row: DatabaseRow): string {
  const prop = titleProperty(db);
  if (!prop) return 'Untitled';
  const text = formatCellValue(prop, row.cells[prop.id]);
  return text || 'Untitled';
}

/**
 * DatabaseRowEditor — shared row detail modal for the calendar and gallery
 * views. Every property is editable with the same cell editors the table
 * view uses.
 */
export function DatabaseRowEditor({
  database,
  row,
  onClose,
  onChange,
}: DatabaseRowEditorProps) {
  const setCell = (rowId: string, propertyId: string, value: CellValue) => {
    onChange({
      ...database,
      rows: database.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [propertyId]: value } } : r,
      ),
      updatedAt: Date.now(),
    });
  };

  const deleteRow = (rowId: string) => {
    onChange({
      ...database,
      rows: database.rows.filter((r) => r.id !== rowId),
      updatedAt: Date.now(),
    });
    onClose();
  };

  return (
    <ModalRoot open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <ModalContent>
        <ModalTitle>{row ? rowTitle(database, row) : ''}</ModalTitle>
        <ModalDescription>Edit this item's properties.</ModalDescription>
        {row && (
          <div className="folio-scroll mt-5 flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
            {database.properties.map((prop) => (
              <label key={prop.id} className="block">
                <span className="mb-1 block font-sans text-xs font-medium text-ink-faint">
                  {prop.name}
                </span>
                <CellEditor
                  property={prop}
                  value={row.cells[prop.id]}
                  onCommit={(v) => setCell(row.id, prop.id, v)}
                  onCancel={() => {}}
                  autoFocus={false}
                />
              </label>
            ))}
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteRow(row.id)}
                className="text-red-600 dark:text-red-400"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Delete item
              </Button>
            </div>
          </div>
        )}
      </ModalContent>
    </ModalRoot>
  );
}
