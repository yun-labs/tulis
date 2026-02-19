import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockNodeView } from '@/components/editor/CodeBlockNodeView';
import { editorLowlight } from '@/lib/editor/codeLowlight';

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({
  lowlight: editorLowlight,
  HTMLAttributes: {
    class: 'tulis-code-block-content',
  },
});
