import { useRef } from 'react';
import {
  X,
  Paperclip,
  UploadCloud,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  File,
  ImagePlus,
  Download,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '@folio/ui/button';
import { cn } from '@folio/ui/cn';
import {
  ATTACHMENT_WARN_BYTES,
  attachmentKind,
  formatBytes,
  isImageAttachment,
  type Attachment,
  type AttachmentKind,
} from '../attachments';

export interface AttachmentsPanelProps {
  /** Rendered only when true; the panel unmounts when closed. */
  open: boolean;
  pageId: string;
  attachments: Attachment[];
  /** True while files are being read into storage. */
  uploading: boolean;
  /** Error/notice text from the last upload attempt, if any. */
  notice: string | null;
  /** Resolve an attachment id to a displayable URL (for thumbnails). */
  urlFor: (id: string) => string | null;
  onUpload: (files: File[]) => void;
  onDownload: (attachment: Attachment) => void;
  onRemove: (id: string) => void;
  /** Insert the image as a block in the page editor. */
  onInsertImage: (attachment: Attachment) => void;
  onDismissNotice: () => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const KIND_ICON: Record<AttachmentKind, typeof File> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  pdf: FileText,
  text: FileText,
  file: File,
};

interface RowProps {
  attachment: Attachment;
  urlFor: (id: string) => string | null;
  onDownload: (attachment: Attachment) => void;
  onRemove: (id: string) => void;
  onInsertImage: (attachment: Attachment) => void;
}

function AttachmentRow({ attachment, urlFor, onDownload, onRemove, onInsertImage }: RowProps) {
  const image = isImageAttachment(attachment);
  const thumbnail = image ? urlFor(attachment.id) : null;
  const Icon = KIND_ICON[attachmentKind(attachment.mimeType)];
  const heavy = attachment.size >= ATTACHMENT_WARN_BYTES;

  return (
    <li className="flex items-center gap-3 rounded-control border border-hairline bg-paper p-2.5 shadow-glass">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="h-11 w-11 shrink-0 rounded-[0.4rem] border border-hairline object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.4rem] border border-hairline bg-paper-deep text-ink-soft">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[13px] font-medium text-ink" title={attachment.name}>
          {attachment.name}
        </p>
        <p className="mt-0.5 font-sans text-xs text-ink-faint">
          {formatBytes(attachment.size)} · {timeAgo(attachment.createdAt)}
          {heavy && <span className="text-amber-600"> · large file</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        {image && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onInsertImage(attachment)}
            aria-label={`Insert ${attachment.name} as an image block`}
            title="Insert as image block"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDownload(attachment)}
          aria-label={`Download ${attachment.name}`}
          title="Download"
        >
          <Download className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(attachment.id)}
          aria-label={`Remove ${attachment.name}`}
          title="Remove"
          className="text-ink-faint hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

/**
 * AttachmentsPanel — the right-rail file list for the open page.
 *
 * Records live in App state (persisted per page in localStorage via the
 * AttachmentStore interface); this panel is pure presentation plus the file
 * picker. Drag-and-drop onto the page is handled by the App's drop zone, not
 * here.
 */
export function AttachmentsPanel({
  open,
  pageId,
  attachments,
  uploading,
  notice,
  urlFor,
  onUpload,
  onDownload,
  onRemove,
  onInsertImage,
  onDismissNotice,
  onClose,
}: AttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!open) return null;

  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);

  return (
    <aside
      key={pageId}
      aria-label="Attachments"
      className="glass-strong flex h-full w-[21rem] shrink-0 flex-col border-l border-hairline"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <Paperclip className="h-4 w-4 text-ink-soft" aria-hidden />
        <h2 className="font-display text-base text-ink">Attachments</h2>
        {attachments.length > 0 && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-sans text-xs font-medium text-ink">
            {attachments.length}
          </span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close attachments">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="folio-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex w-full flex-col items-center gap-1.5 rounded-control border border-dashed border-hairline',
            'px-4 py-6 font-sans text-sm text-ink-soft transition-colors duration-quick ease-folio',
            'hover:border-accent/50 hover:text-ink disabled:cursor-wait disabled:opacity-60',
          )}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="h-6 w-6" aria-hidden />
          )}
          <span>{uploading ? 'Reading files…' : 'Add files'}</span>
          <span className="text-xs text-ink-faint">
            …or drag them onto the page. Files over {formatBytes(ATTACHMENT_WARN_BYTES)} are
            flagged as large; {formatBytes(15 * 1024 * 1024)} is the limit.
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onUpload([...e.target.files]);
            e.target.value = '';
          }}
        />

        {notice && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control border border-red-500/30 bg-red-500/10 px-3 py-2.5"
          >
            <p className="min-w-0 flex-1 font-sans text-[13px] leading-relaxed text-ink">
              {notice}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDismissNotice}
              aria-label="Dismiss notice"
              className="-mr-1 -mt-1 h-6 w-6"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {attachments.length === 0 ? (
          <div className="rounded-control border border-dashed border-hairline p-6 text-center">
            <p className="font-sans text-sm text-ink-soft">No attachments yet.</p>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ink-faint">
              Attach reference files to this page. Images can be inserted as blocks in the
              editor from here.
            </p>
          </div>
        ) : (
          <>
            <p className="font-sans text-xs text-ink-faint">
              {attachments.length} {attachments.length === 1 ? 'file' : 'files'} ·{' '}
              {formatBytes(totalBytes)} total
            </p>
            <ul className="space-y-2">
              {attachments.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  urlFor={urlFor}
                  onDownload={onDownload}
                  onRemove={onRemove}
                  onInsertImage={onInsertImage}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
