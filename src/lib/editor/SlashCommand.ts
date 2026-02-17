import { Extension, Editor, Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { getSuggestionConfig } from '@/lib/editor/suggestion';
import { CommandItem } from '@/components/editor/CommandMenu';
import { TagChipColor } from '@/editor/TagChip';

const insertOrRecolorTag = (editor: Editor, color: TagChipColor) => {
    if (editor.isActive('tagChip')) {
        editor.chain().focus().setTagChipColor(color).run();
        return;
    }
    editor.chain().focus().insertTagChip({ color, text: 'tag' }).run();
};

export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                startOfLine: false,
                command: ({ editor, range, props }: { editor: Editor; range: Range; props: { command: (props: { editor: Editor; range: Range }) => void } }) => {
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
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().setParagraph().run();
                },
            },
            {
                title: 'Heading 1',
                description: 'Big section heading',
                icon: 'H1',
                aliases: ['h1', 'big', 'large'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 1 }).run();
                },
            },
            {
                title: 'Heading 2',
                description: 'Medium section heading',
                icon: 'H2',
                aliases: ['h2', 'medium'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 2 }).run();
                },
            },
            {
                title: 'Heading 3',
                description: 'Small section heading',
                icon: 'H3',
                aliases: ['h3', 'small'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 3 }).run();
                },
            },
            {
                title: 'Bullet List',
                description: 'Create a simple bullet list',
                icon: '•',
                aliases: ['ul', 'bullets', 'list'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().toggleBulletList().run();
                },
            },
            {
                title: 'Numbered List',
                description: 'Create a numbered list',
                icon: '1.',
                aliases: ['ol', 'numbers', '1', 'list'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().toggleOrderedList().run();
                },
            },
            {
                title: 'Task List',
                description: 'Track tasks with a checklist',
                icon: '☑',
                aliases: ['todo', 'check', 'task'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).clearNodes().toggleTaskList().run();
                },
            },
            {
                title: 'Tag',
                description: 'Insert an inline editable tag chip',
                icon: '🏷',
                aliases: ['tag', 'chip', 'label'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'blue');
                },
            },
            {
                title: 'Tag Blue',
                description: 'Insert or recolor tag to blue',
                icon: '🔵',
                aliases: ['tag-blue', 'blue-tag', 'tagblue'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'blue');
                },
            },
            {
                title: 'Tag Green',
                description: 'Insert or recolor tag to green',
                icon: '🟢',
                aliases: ['tag-green', 'green-tag', 'taggreen'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'green');
                },
            },
            {
                title: 'Tag Yellow',
                description: 'Insert or recolor tag to yellow',
                icon: '🟡',
                aliases: ['tag-yellow', 'yellow-tag', 'tagyellow'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'yellow');
                },
            },
            {
                title: 'Tag Red',
                description: 'Insert or recolor tag to red',
                icon: '🔴',
                aliases: ['tag-red', 'red-tag', 'tagred'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'red');
                },
            },
            {
                title: 'Tag Purple',
                description: 'Insert or recolor tag to purple',
                icon: '🟣',
                aliases: ['tag-purple', 'purple-tag', 'tagpurple'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    insertOrRecolorTag(editor, 'purple');
                },
            },
            {
                title: 'Quote',
                description: 'Capture a quote',
                icon: '"',
                aliases: ['blockquote', 'quote'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).toggleBlockquote().run();
                },
            },
            {
                title: 'Code Block',
                description: 'Display code with syntax highlighting',
                icon: '</>',
                aliases: ['code', 'pre', 'snippet'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
                },
            },
            {
                title: 'Divider',
                description: 'Visually divide blocks',
                icon: '—',
                aliases: ['hr', 'line', 'divider', 'separator'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).setHorizontalRule().run();
                },
            },
            {
                title: 'Date',
                description: 'Pick a date to insert',
                icon: '📅',
                aliases: ['date', 'calendar'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).run();
                    (editor as any).emit('openDatePicker');
                },
            },
            {
                title: 'Today',
                description: 'Insert today\'s date instantly',
                icon: '☀️',
                aliases: ['today', 'now'],
                command: ({ editor, range }: { editor: Editor; range: Range }) => {
                    editor.chain().focus().deleteRange(range).setDateChip({ date: new Date().toISOString() }).run();
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
