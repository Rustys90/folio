import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  Hash,
  List,
  Pencil,
  Plus,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@folio/ui/button';
import { Input } from '@folio/ui/input';
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from '@folio/ui/menu';
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
  PropertyType,
} from '../database-types';
import { newDbId } from '../database-types';
import { CellEditor, CellValueView } from './database-cells';

const TYPE_META: { type: PropertyType; label: string; icon: LucideIcon }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'select', label: 'Select', icon: List },
  { type: 'date', label: 'Date', icon: Calendar },
];

function typeIcon(type: PropertyType): LucideIcon {
  return TYPE_META.find((t) => t.type === type)!.icon;
}

interface SortState {
  propertyId: string;
  direction: 'asc' | 'desc';
}

function compareCells(a: CellValue, b: CellValue, type: PropertyType): number {
  const emptyA = a === undefined || a === '';
  const emptyB = b === undefined || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;
  if (type === 'number') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

interface PropertyModalState {
  mode: 'add' | 'rename';
  property?: PropertyDef;
}

export interface DatabaseTableProps {
  database: FolioDatabase;
  onChange: (db: FolioDatabase) => void;
}

/**
 * DatabaseTable — Notion-like grid with sortable headers, inline cell
 * editing, and row/column management. All mutations go through `onChange`
 * with a new immutable database object.
 */
export function DatabaseTable({ database, onChange }: DatabaseTableProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [editing, setEditing] = useState<{
    rowId: string;
    propertyId: string;
  } | null>(null);
  const [modal, setModal] = useState<PropertyModalState | null>(null);
  const [propName, setPropName] = useState('');
  const [propType, setPropType] = useState<PropertyType>('text');
  const [propOptions, setPropOptions] = useState('');

  const sortedRows = useMemo(() => {
    if (!sort) return database.rows;
    const prop = database.properties.find((p) => p.id === sort.propertyId);
    if (!prop) return database.rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...database.rows].sort(
      (ra, rb) => compareCells(ra.cells[prop.id], rb.cells[prop.id], prop.type) * dir,
    );
  }, [database.rows, database.properties, sort]);

  const openAddModal = () => {
    setPropName('');
    setPropType('text');
    setPropOptions('');
    setModal({ mode: 'add' });
  };

  const openRenameModal = (property: PropertyDef) => {
    setPropName(property.name);
    setPropType(property.type);
    setPropOptions((property.options ?? []).join(', '));
    setModal({ mode: 'rename', property });
  };

  const saveModal = () => {
    const name = propName.trim() || 'Untitled';
    if (modal?.mode === 'add') {
      const prop: PropertyDef = {
        id: newDbId('prop'),
        name,
        type: propType,
        ...(propType === 'select'
          ? {
              options: propOptions
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
            }
          : {}),
      };
      onChange({
        ...database,
        properties: [...database.properties, prop],
        updatedAt: Date.now(),
      });
    } else if (modal?.mode === 'rename' && modal.property) {
      onChange({
        ...database,
        properties: database.properties.map((p) =>
          p.id === modal.property!.id ? { ...p, name } : p,
        ),
        updatedAt: Date.now(),
      });
    }
    setModal(null);
  };

  const addRow = () => {
    const row: DatabaseRow = { id: newDbId('row'), cells: {} };
    onChange({ ...database, rows: [...database.rows, row], updatedAt: Date.now() });
  };

  const deleteRow = (rowId: string) => {
    onChange({
      ...database,
      rows: database.rows.filter((r) => r.id !== rowId),
      updatedAt: Date.now(),
    });
  };

  const deleteProperty = (propertyId: string) => {
    onChange({
      ...database,
      properties: database.properties.filter((p) => p.id !== propertyId),
      rows: database.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[propertyId];
        return { ...r, cells };
      }),
      kanbanGroupBy:
        database.kanbanGroupBy === propertyId ? null : database.kanbanGroupBy,
      calendarDateProp:
        database.calendarDateProp === propertyId ? null : database.calendarDateProp,
      updatedAt: Date.now(),
    });
    setSort((s) => (s?.propertyId === propertyId ? null : s));
  };

  const setCell = (rowId: string, propertyId: string, value: CellValue) => {
    onChange({
      ...database,
      rows: database.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [propertyId]: value } } : r,
      ),
      updatedAt: Date.now(),
    });
    setEditing(null);
  };

  const toggleSort = (propertyId: string) => {
    setSort((prev) => {
      if (!prev || prev.propertyId !== propertyId) {
        return { propertyId, direction: 'asc' };
      }
      if (prev.direction === 'asc') return { propertyId, direction: 'desc' };
      return null;
    });
  };

  return (
    <div className="folio-scroll overflow-x-auto pb-4">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            <th className="w-8 px-1" aria-label="Row actions" />
            {database.properties.map((prop) => {
              const Icon = typeIcon(prop.type);
              const active = sort?.propertyId === prop.id;
              return (
                <th
                  key={prop.id}
                  className="min-w-36 px-1 py-1 font-sans"
                  scope="col"
                >
                  <div className="group flex items-center gap-1">
                    <button
                      onClick={() => toggleSort(prop.id)}
                      title={`Sort by ${prop.name}`}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-2 py-1.5 text-left',
                        'text-xs font-medium text-ink-faint transition-colors duration-quick ease-folio',
                        'hover:bg-accent-soft hover:text-ink',
                        active && 'text-ink',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{prop.name}</span>
                      {active &&
                        (sort.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                        ))}
                    </button>
                    <MenuRoot>
                      <MenuTrigger asChild>
                        <button
                          aria-label={`${prop.name} column options`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-faint opacity-0 transition-all duration-quick hover:bg-accent-soft hover:text-ink group-hover:opacity-100"
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </MenuTrigger>
                      <MenuContent align="start">
                        <MenuItem onSelect={() => openRenameModal(prop)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Rename
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          onSelect={() => deleteProperty(prop.id)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete column
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </div>
                </th>
              );
            })}
            <th className="w-12 px-1">
              <button
                onClick={openAddModal}
                aria-label="Add column"
                title="Add column"
                className="flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors duration-quick ease-folio hover:bg-accent-soft hover:text-ink"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.id}
              className="group/row border-b border-hairline transition-colors duration-quick ease-folio hover:bg-accent-soft/40"
            >
              <td className="px-1">
                <button
                  onClick={() => deleteRow(row.id)}
                  aria-label="Delete row"
                  title="Delete row"
                  className="flex h-6 w-6 items-center justify-center rounded-control text-ink-faint opacity-0 transition-all duration-quick hover:bg-red-500/15 hover:text-red-600 group-hover/row:opacity-100 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </td>
              {database.properties.map((prop) => {
                const isEditing =
                  editing?.rowId === row.id && editing.propertyId === prop.id;
                return (
                  <td key={prop.id} className="px-1 py-0.5 font-sans text-sm">
                    {isEditing ? (
                      <div className="px-1 py-1">
                        <CellEditor
                          property={prop}
                          value={row.cells[prop.id]}
                          onCommit={(v) => setCell(row.id, prop.id, v)}
                          onCancel={() => setEditing(null)}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setEditing({ rowId: row.id, propertyId: prop.id })
                        }
                        title={`Edit ${prop.name}`}
                        className="block w-full rounded-control px-2 py-1.5 text-left text-ink transition-colors duration-quick ease-folio hover:bg-paper-deep"
                      >
                        <CellValueView property={prop} value={row.cells[prop.id]} />
                      </button>
                    )}
                  </td>
                );
              })}
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      {database.rows.length === 0 && (
        <p className="px-2 py-8 text-center font-sans text-sm text-ink-faint">
          No rows yet. Add the first one below.
        </p>
      )}

      <div className="mt-2 px-1">
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New row
        </Button>
      </div>

      {/* Add / rename column */}
      <ModalRoot open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <ModalContent>
          <ModalTitle>
            {modal?.mode === 'add' ? 'Add column' : 'Rename column'}
          </ModalTitle>
          <ModalDescription>
            {modal?.mode === 'add'
              ? 'Name the column and pick a property type.'
              : 'Give the column a new name.'}
          </ModalDescription>
          <div className="mt-5 flex flex-col gap-4">
            <Input
              value={propName}
              onChange={(e) => setPropName(e.target.value)}
              placeholder="Column name"
              aria-label="Column name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveModal();
              }}
            />
            {modal?.mode === 'add' && (
              <>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Property type"
                >
                  {TYPE_META.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      role="radio"
                      aria-checked={propType === type}
                      onClick={() => setPropType(type)}
                      className={cn(
                        'flex items-center gap-2 rounded-control border px-3 py-2.5 font-sans text-sm transition-all duration-quick ease-folio',
                        propType === type
                          ? 'border-accent bg-accent-soft text-ink'
                          : 'border-hairline text-ink-soft hover:border-accent/40 hover:text-ink',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
                {propType === 'select' && (
                  <Input
                    value={propOptions}
                    onChange={(e) => setPropOptions(e.target.value)}
                    placeholder="Options, comma separated (e.g. Todo, Doing, Done)"
                    aria-label="Select options"
                  />
                )}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveModal}>
                {modal?.mode === 'add' ? 'Add column' : 'Rename'}
              </Button>
            </div>
          </div>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
