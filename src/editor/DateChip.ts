import { Node, mergeAttributes } from '@tiptap/core';

export interface DateChipOptions {
    HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        dateChip: {
            /**
             * Insert a date chip
             */
            setDateChip: (attributes: { date: string }) => ReturnType;
        };
    }
}

export const DateChip = Node.create<DateChipOptions>({
    name: 'dateChip',

    group: 'inline',

    inline: true,

    selectable: true,

    atom: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            date: {
                default: null,
                parseHTML: element => element.getAttribute('data-date'),
                renderHTML: attributes => {
                    if (!attributes.date) {
                        return {};
                    }

                    return {
                        'data-date': attributes.date,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-date-chip]',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const date = new Date(node.attrs.date);
        const formattedDate = isNaN(date.getTime())
            ? 'Invalid Date'
            : new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }).format(date);

        return [
            'span',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                'data-date-chip': '',
                class: 'date-chip',
            }),
            formattedDate,
        ];
    },

    addCommands() {
        return {
            setDateChip:
                attributes =>
                    ({ chain }) => {
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: attributes,
                            })
                            .insertContent(' ')
                            .run();
                    },
        };
    },
});
