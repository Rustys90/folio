import { Extension, Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState } from '@tiptap/pm/state';

/**
 * FolioToggle — a collapsible block container, written from scratch.
 *
 * The first child block acts as the visible "title"; remaining children collapse
 * when `open` is false. Rendered as a plain div so Yjs collaboration stays
 * conflict-free (all state lives in the `open` attribute).
 */
export const FolioToggle = Node.create({
  name: 'folioToggle',

  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-open') !== 'false',
        renderHTML: (attributes) => ({ 'data-open': String(attributes.open) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-folio-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-folio-toggle': '' }), 0];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'folio-toggle';
      dom.dataset.open = String(node.attrs.open);

      const chevron = document.createElement('button');
      chevron.type = 'button';
      chevron.className = 'folio-toggle-chevron';
      chevron.setAttribute('aria-label', 'Toggle section');
      chevron.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
      chevron.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const open = !node.attrs.open;
        editor.commands.command(({ tr }) => {
          tr.setNodeAttribute(pos, 'open', open);
          return true;
        });
      });

      const content = document.createElement('div');
      content.className = 'folio-toggle-content';

      dom.append(chevron, content);

      return {
        dom,
        contentDOM: content,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'folioToggle') return false;
          dom.dataset.open = String(updatedNode.attrs.open);
          node = updatedNode;
          return true;
        },
      };
    };
  },

  addInputRules() {
    // Typing ">> " at the start of an empty paragraph wraps it in a toggle.
    return [
      wrappingInputRule({
        find: /^>>\s$/,
        type: this.type,
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Cmd/Ctrl+. toggles the open state of the toggle under the cursor.
      'Mod-.': () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === 'folioToggle') {
            const pos = $from.before(depth);
            return this.editor.commands.command(({ tr }) => {
              tr.setNodeAttribute(pos, 'open', !node.attrs.open);
              return true;
            });
          }
        }
        return false;
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    folioComments: {
      /** Replace the set of top-level block indices that carry comments. */
      setCommentedBlocks: (indices: number[]) => ReturnType;
    };
  }
}

const folioCommentsKey = new PluginKey('folioComments');

/**
 * FolioComments — visual markers for block-level comments, written from scratch.
 *
 * The web app owns the comment data; this extension only paints. The host calls
 * `editor.commands.setCommentedBlocks([...])` with the 0-based top-level block
 * indices that carry unresolved threads, and each of those blocks gets a
 * `folio-comment-anchor` node decoration (styled in editor.css). Indices are
 * re-resolved by the host after edits, so the extension never guesses anchors.
 */
export const FolioComments = Extension.create({
  name: 'folioComments',

  addCommands() {
    return {
      setCommentedBlocks:
        (indices: number[]) =>
        ({ editor }) => {
          // A meta-only transaction: no document change, just recompute decorations.
          editor.view.dispatch(editor.state.tr.setMeta(folioCommentsKey, new Set(indices)));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<number>>({
        key: folioCommentsKey,
        state: {
          init: () => new Set<number>(),
          apply: (tr, value) => {
            const next: unknown = tr.getMeta(folioCommentsKey);
            return next instanceof Set ? next : value;
          },
        },
        props: {
          decorations: (state: EditorState) => {
            const indices = folioCommentsKey.getState(state);
            if (!indices || indices.size === 0) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            state.doc.content.forEach((node, offset, index) => {
              if (indices.has(index)) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: 'folio-comment-anchor',
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
