import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import type { Doc as YDoc } from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { FolioToggle, FolioComments } from './extensions';
import { isDocEmpty } from '@folio/sync/doc';
import { cn } from '@folio/ui/cn';

export interface FolioUser {
  name: string;
  color: string;
}

export interface FolioEditorProps {
  /** Yjs document backing this editor. One per page. */
  ydoc: YDoc;
  /** Optional live provider for realtime collaboration. Omit for offline editing. */
  provider?: WebsocketProvider | null;
  /** Local user identity, shown on the collaboration cursor. */
  user?: FolioUser;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  onUpdate?: () => void;
  /**
   * HTML written into the Yjs document on first open, when the document is
   * still empty. Used for seed content; never overwrites existing content.
   */
  initialHtml?: string;
  /**
   * Receives the live TipTap editor instance (null before creation and after
   * unmount). Lets the host read the selection, resolve comment anchors, and
   * drive the FolioComments decorations.
   */
  onEditorChange?: (editor: Editor | null) => void;
  /** Imperative handle for the live editor, kept in sync alongside onEditorChange. */
  editorRef?: RefObject<Editor | null>;
}

/**
 * <FolioEditor> — Folio's block editor.
 *
 * Paragraphs, H1–H3, bullet/numbered lists, toggles, code blocks, blockquotes
 * and dividers, backed by a Yjs document so every keystroke is collaboration-ready.
 */
export function FolioEditor({
  ydoc,
  provider = null,
  user,
  editable = true,
  placeholder = 'Start writing…',
  className,
  onUpdate,
  initialHtml,
  onEditorChange,
  editorRef,
}: FolioEditorProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // Yjs owns undo history via the shared document.
          history: false,
        }),
        FolioToggle,
        FolioComments,
        Collaboration.configure({ document: ydoc }),
        ...(provider && user ? [CollaborationCursor.configure({ provider, user })] : []),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: 'folio-empty',
        }),
      ],
      editable,
      editorProps: {
        attributes: { class: 'folio-prosemirror' },
      },
      onCreate: ({ editor: created }) => {
        if (initialHtml && isDocEmpty(ydoc)) {
          created.commands.setContent(initialHtml);
        }
      },
      onUpdate,
    },
    [ydoc, provider],
  );

  // Publish the live editor to the host (ref + callback), clearing both on unmount.
  useEffect(() => {
    const instance = editor ?? null;
    if (editorRef) editorRef.current = instance;
    onEditorChange?.(instance);
    return () => {
      if (editorRef) editorRef.current = null;
      onEditorChange?.(null);
    };
  }, [editor, editorRef, onEditorChange]);

  return <EditorContent editor={editor} className={cn('folio-editor', className)} />;
}
