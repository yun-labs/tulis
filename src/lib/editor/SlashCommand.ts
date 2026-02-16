import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { getSuggestionConfig } from '@/lib/editor/suggestion';
import { CommandItem } from '@/components/editor/CommandMenu';

export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                startOfLine: false,
                command: ({ editor, range, props }: any) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        const items: CommandItem[] = [
            {
                title: 'Text',
                description: 'Just start typing with plain text',
                icon: '📝',
                aliases: ['p', 'paragraph'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).setParagraph().run();
                },
            },
            {
                title: 'Heading 1',
                description: 'Big section heading',
                icon: 'H1',
                aliases: ['h1', 'big', 'large'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
                },
            },
            {
                title: 'Heading 2',
                description: 'Medium section heading',
                icon: 'H2',
                aliases: ['h2', 'medium'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
                },
            },
            {
                title: 'Heading 3',
                description: 'Small section heading',
                icon: 'H3',
                aliases: ['h3', 'small'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
                },
            },
            {
                title: 'Bullet List',
                description: 'Create a simple bullet list',
                icon: '•',
                aliases: ['ul', 'bullets', 'list'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).toggleBulletList().run();
                },
            },
            {
                title: 'Numbered List',
                description: 'Create a numbered list',
                icon: '1.',
                aliases: ['ol', 'numbers', '1', 'list'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).toggleOrderedList().run();
                },
            },
            {
                title: 'Task List',
                description: 'Track tasks with a checklist',
                icon: '☑',
                aliases: ['todo', 'check', 'task'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).toggleTaskList().run();
                },
            },
            {
                title: 'Quote',
                description: 'Capture a quote',
                icon: '"',
                aliases: ['blockquote', 'quote'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).toggleBlockquote().run();
                },
            },
            {
                title: 'Code Block',
                description: 'Display code with syntax highlighting',
                icon: '</>',
                aliases: ['code', 'pre', 'snippet'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
                },
            },
            {
                title: 'Divider',
                description: 'Visually divide blocks',
                icon: '—',
                aliases: ['hr', 'line', 'divider', 'separator'],
                command: ({ editor, range }: any) => {
                    editor.chain().focus().deleteRange(range).setHorizontalRule().run();
                },
            },
        ];

        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
                ...getSuggestionConfig(items),
            }),
        ];
    },
});
