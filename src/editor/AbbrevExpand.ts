import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

function apply(exp: string, editor: Editor) {
  const s = exp.trim();

  const mTodo = s.match(/^todo(?:>(\d+))?$/i);
  if (mTodo) {
    const n = Number(mTodo[1] ?? 1);
    editor.chain().focus().insertContent({
      type: 'taskList',
      content: Array.from({ length: n }, () => ({
        type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }],
      })),
    }).run();
    return true;
  }

  const mUl = s.match(/^ul(?:>li(?:\*(\d+))?)?$/i);
  if (mUl) {
    const n = Number(mUl[1] ?? 1);
    editor.chain().focus().insertContent({
      type: 'bulletList',
      content: Array.from({ length: n }, () => ({
        type: 'listItem', content: [{ type: 'paragraph' }],
      })),
    }).run();
    return true;
  }

  const mOl = s.match(/^ol(?:>li(?:\*(\d+))?)?$/i);
  if (mOl) {
    const n = Number(mOl[1] ?? 1);
    editor.chain().focus().insertContent({
      type: 'orderedList',
      content: Array.from({ length: n }, () => ({
        type: 'listItem', content: [{ type: 'paragraph' }],
      })),
    }).run();
    return true;
  }

  const mH = s.match(/^h([1-6])\.?(.*)$/i);
  if (mH) {
    const level = Number(mH[1]);
    const text = (mH[2] || '').trim();
    editor.chain().focus().insertContent({
      type: 'heading', attrs: { level },
      content: text ? [{ type: 'text', text }] : [],
    }).run();
    return true;
  }

  if (/^hr$/i.test(s)) {
    editor.chain().focus().setHorizontalRule().run();
    return true;
  }

  return false;
}

export const AbbrevExpand = Extension.create({
  name: 'abbrevExpand',
  addKeyboardShortcuts() {
    const trigger = () => {
      const { state } = this.editor;
      const { from } = state.selection as any;
      const $pos: any = state.selection.$from;
      const lineStart = $pos.before($pos.depth);
      const lineText = state.doc.textBetween(lineStart, from);
      if (apply(lineText, this.editor)) {
        this.editor.commands.deleteRange({ from: lineStart, to: from });
        return true;
      }
      return false;
    };
    return {
      Tab: trigger,
      'Mod-e': trigger, // fallback on keyboards without Tab
    };
  },
});