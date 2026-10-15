import { useEffect, useRef, useState } from 'react';
import { ModalRoot, ModalContent, ModalTitle, ModalDescription } from '@folio/ui/modal';
import { Button } from '@folio/ui/button';
import { Input } from '@folio/ui/input';
import { cn } from '@folio/ui/cn';
import {
  FileText,
  Table2,
  Code2,
  ArrowLeft,
  TriangleAlert,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import type { FolioDatabase } from '../database-types';
import {
  ImportError,
  markdownToHtml,
  htmlToBlocks,
  parseCsv,
  csvToDatabase,
  titleFromFilename,
  type ParsedCsv,
} from '../utils/import';

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportPage: (title: string, html: string) => void;
  onImportDatabase: (database: FolioDatabase) => void;
}

type Format = 'markdown' | 'csv' | 'html';

const FORMATS: Array<{
  id: Format;
  name: string;
  description: string;
  accept: string;
  icon: typeof FileText;
  detail: string;
}> = [
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Headings, lists, code blocks, quotes, and links become blocks.',
    accept: '.md,.markdown,.txt',
    icon: FileText,
    detail: 'Creates a new page',
  },
  {
    id: 'csv',
    name: 'CSV',
    description: 'First row becomes columns; types are inferred from the data.',
    accept: '.csv',
    icon: Table2,
    detail: 'Creates a new database',
  },
  {
    id: 'html',
    name: 'HTML',
    description: 'Headings, paragraphs, and lists are kept; layout is dropped.',
    accept: '.html,.htm',
    icon: Code2,
    detail: 'Creates a new page',
  },
];

/** 5 MB — generous for documents, small enough to keep parsing instant. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Preview {
  kind: 'page';
  html: string;
  summary: string;
}

function buildPreview(format: Format, text: string): Preview | { kind: 'csv'; parsed: ParsedCsv } {
  switch (format) {
    case 'markdown': {
      const html = markdownToHtml(text);
      const blocks = html.split('\n').filter((b) => b.trim() !== '').length;
      return { kind: 'page', html, summary: `${blocks} blocks` };
    }
    case 'html': {
      const html = htmlToBlocks(text);
      const blocks = html.split('\n').filter((b) => b.trim() !== '').length;
      return { kind: 'page', html, summary: `${blocks} blocks` };
    }
    case 'csv': {
      const parsed = parseCsv(text);
      return { kind: 'csv', parsed };
    }
  }
}

const previewClasses = cn(
  'folio-scroll max-h-64 overflow-y-auto rounded-control border border-hairline bg-paper p-4',
  'font-sans text-sm text-ink',
  '[&_h1]:font-display [&_h1]:text-xl [&_h1]:mb-2 [&_h1]:mt-3',
  '[&_h2]:font-display [&_h2]:text-lg [&_h2]:mb-2 [&_h2]:mt-3',
  '[&_h3]:font-display [&_h3]:text-base [&_h3]:mb-1.5 [&_h3]:mt-2.5',
  '[&_p]:mb-2 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2',
  '[&_li]:mb-1',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-accent/40 [&_blockquote]:pl-3',
  '[&_blockquote]:italic [&_blockquote]:text-ink-soft [&_blockquote]:my-2',
  '[&_pre]:rounded-control [&_pre]:bg-paper-deep [&_pre]:p-3 [&_pre]:text-xs',
  '[&_pre]:overflow-x-auto [&_pre]:my-2',
  '[&_code]:rounded [&_code]:bg-paper-deep [&_code]:px-1 [&_code]:text-[13px]',
  '[&_a]:text-accent [&_a]:underline',
  '[&_hr]:my-3 [&_hr]:border-hairline',
);

/**
 * ImportDialog — bring content in from the outside world. Pick a format,
 * choose a file, review the preview, confirm. Failures explain themselves
 * in plain language instead of dumping a stack trace.
 */
export function ImportDialog({ open, onOpenChange, onImportPage, onImportDatabase }: ImportDialogProps) {
  const [format, setFormat] = useState<Format | null>(null);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fresh state on every open.
  useEffect(() => {
    if (open) {
      setFormat(null);
      setFileName('');
      setTitle('');
      setError(null);
      setPreview(null);
      setParsedCsv(null);
    }
  }, [open]);

  const pickFile = (next: Format) => {
    setFormat(next);
    setError(null);
    // Let the dialog settle before opening the native picker.
    window.setTimeout(() => fileRef.current?.click(), 50);
  };

  const back = () => {
    setFormat(null);
    setError(null);
    setPreview(null);
    setParsedCsv(null);
    setFileName('');
    setTitle('');
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !format) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB — imports are limited to 5 MB.`);
      return;
    }
    try {
      const text = await file.text();
      const result = buildPreview(format, text);
      setFileName(file.name);
      setTitle(titleFromFilename(file.name));
      if (result.kind === 'csv') {
        setParsedCsv(result.parsed);
        setPreview(null);
      } else {
        setPreview(result);
        setParsedCsv(null);
      }
    } catch (err) {
      setError(
        err instanceof ImportError
          ? err.message
          : `Couldn't read “${file.name}”. Try a different file.`,
      );
    }
  };

  const confirm = () => {
    const finalTitle = title.trim() === '' ? 'Imported' : title.trim();
    if (format === 'csv' && parsedCsv) {
      try {
        onImportDatabase(csvToDatabase(finalTitle, parsedCsv));
      } catch (err) {
        setError(
          err instanceof ImportError ? err.message : 'Something went wrong building that database.',
        );
        return;
      }
    } else if (preview) {
      onImportPage(finalTitle, preview.html);
    } else {
      return;
    }
    onOpenChange(false);
  };

  const formatMeta = FORMATS.find((f) => f.id === format);
  const ready = format === 'csv' ? parsedCsv !== null : preview !== null;

  return (
    <ModalRoot open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-label="Import" className="max-w-2xl">
        <input
          ref={fileRef}
          type="file"
          accept={formatMeta?.accept}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {format === null ? (
          <>
            <ModalTitle>Import</ModalTitle>
            <ModalDescription>
              Bring in content from elsewhere. Nothing leaves this device.
            </ModalDescription>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pickFile(f.id)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-card border border-hairline bg-paper p-4 text-left',
                    'transition-[transform,border-color,box-shadow] duration-quick ease-folio',
                    'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glass',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  )}
                >
                  <f.icon className="h-5 w-5 text-accent" aria-hidden />
                  <span className="font-sans text-sm font-semibold text-ink">{f.name}</span>
                  <span className="font-sans text-xs leading-relaxed text-ink-soft">
                    {f.description}
                  </span>
                  <span className="mt-1 font-sans text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                    {f.detail}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <ModalTitle className="flex items-center gap-2">
              <button
                onClick={back}
                aria-label="Back to format choices"
                className="flex h-7 w-7 items-center justify-center rounded-control text-ink-soft transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              Import {formatMeta?.name}
            </ModalTitle>
            <ModalDescription>
              {preview || parsedCsv
                ? 'Review what Folio understood, then confirm.'
                : 'Choose a file to import.'}
            </ModalDescription>

            <div className="mt-5">
              {!preview && !parsedCsv && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    'flex w-full flex-col items-center gap-2 rounded-card border border-dashed',
                    'border-hairline bg-paper px-4 py-10 text-center',
                    'transition-colors duration-quick ease-folio hover:border-accent/50 hover:bg-accent-soft/40',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  )}
                >
                  <Upload className="h-6 w-6 text-ink-faint" aria-hidden />
                  <span className="font-sans text-sm font-medium text-ink">
                    Choose a {formatMeta?.name} file
                  </span>
                  <span className="font-sans text-xs text-ink-faint">
                    {formatMeta?.accept} · up to 5 MB
                  </span>
                </button>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-control border border-red-500/30 bg-red-500/10 px-3.5 py-3"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
                  <p className="font-sans text-sm leading-relaxed text-ink">{error}</p>
                </div>
              )}

              {(preview ?? parsedCsv) && !error && (
                <div>
                  <div className="mb-3">
                    <label
                      htmlFor="folio-import-title"
                      className="mb-1.5 block font-sans text-xs font-medium text-ink-soft"
                    >
                      {format === 'csv' ? 'Database title' : 'Page title'}
                    </label>
                    <Input
                      id="folio-import-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Imported"
                    />
                  </div>

                  {preview && (
                    <>
                      <p className="mb-1.5 flex items-center gap-1.5 font-sans text-xs font-medium text-ink-soft">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                        {preview.summary} from “{fileName}”
                      </p>
                      <div
                        className={previewClasses}
                        dangerouslySetInnerHTML={{ __html: preview.html }}
                      />
                    </>
                  )}

                  {parsedCsv && (
                    <>
                      <p className="mb-1.5 flex items-center gap-1.5 font-sans text-xs font-medium text-ink-soft">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                        {parsedCsv.rows.length} rows · {parsedCsv.headers.length} columns from “
                        {fileName}”
                      </p>
                      <div className="folio-scroll max-h-64 overflow-auto rounded-control border border-hairline">
                        <table className="w-full border-collapse font-sans text-xs">
                          <thead>
                            <tr className="bg-paper-deep">
                              {parsedCsv.headers.map((h) => (
                                <th
                                  key={h}
                                  className="border-b border-hairline px-3 py-2 text-left font-semibold text-ink"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {parsedCsv.rows.slice(0, 6).map((row, ri) => (
                              <tr key={ri} className="odd:bg-paper even:bg-paper-deep/50">
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    className="max-w-40 truncate border-b border-hairline/60 px-3 py-1.5 text-ink-soft"
                                  >
                                    {cell === '' ? (
                                      <span className="text-ink-faint">—</span>
                                    ) : (
                                      cell
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {parsedCsv.rows.length > 6 && (
                          <p className="bg-paper px-3 py-2 font-sans text-xs text-ink-faint">
                            …and {parsedCsv.rows.length - 6} more rows
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
              <Button variant="primary" onClick={confirm} disabled={!ready}>
                {format === 'csv' ? 'Create database' : 'Create page'}
              </Button>
            </div>
          </>
        )}
      </ModalContent>
    </ModalRoot>
  );
}
