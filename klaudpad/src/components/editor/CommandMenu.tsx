'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Editor } from '@tiptap/react';

export type CommandItem = {
    title: string;
    description: string;
    icon: string;
    aliases?: string[];
    command: (props: { editor: Editor; range: any }) => void;
};

export type CommandMenuProps = {
    items: CommandItem[];
    command: (item: CommandItem) => void;
};

export type CommandMenuRef = {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export const CommandMenu = forwardRef<CommandMenuRef, CommandMenuProps>(
    ({ items, command }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);

        useEffect(() => {
            setSelectedIndex(0);
        }, [items]);

        const selectItem = (index: number) => {
            const item = items[index];
            if (item) {
                command(item);
            }
        };

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }) => {
                if (event.key === 'ArrowUp') {
                    setSelectedIndex((selectedIndex + items.length - 1) % items.length);
                    return true;
                }

                if (event.key === 'ArrowDown') {
                    setSelectedIndex((selectedIndex + 1) % items.length);
                    return true;
                }

                if (event.key === 'Enter') {
                    selectItem(selectedIndex);
                    return true;
                }

                return false;
            },
        }));

        return (
            <div className="klaud-surface border klaud-border rounded-lg shadow-xl overflow-hidden min-w-[280px] max-h-[400px] overflow-y-auto">
                {items.length > 0 ? (
                    <div className="p-1">
                        {items.map((item, index) => (
                            <button
                                key={index}
                                type="button"
                                className={`w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors ${index === selectedIndex
                                    ? 'bg-[color:var(--klaud-accent)]/[0.15] text-[color:var(--klaud-accent)]'
                                    : 'klaud-text hover:bg-[color:var(--klaud-border)]'
                                    }`}
                                onClick={() => selectItem(index)}
                            >
                                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">{item.title}</div>
                                    <div className="text-xs klaud-muted truncate">{item.description}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="px-3 py-2 text-sm klaud-muted">No results</div>
                )}
            </div>
        );
    }
);

CommandMenu.displayName = 'CommandMenu';
