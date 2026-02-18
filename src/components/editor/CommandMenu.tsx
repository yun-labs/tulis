'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Editor } from '@tiptap/react';
import { IconType } from 'react-icons';

import { Range } from '@tiptap/core';

export type CommandItem = {
    title: string;
    description: string;
    icon: IconType;
    aliases?: string[];
    command: (props: { editor: Editor; range: Range }) => void;
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
        const activeIndex = items.length === 0 ? -1 : Math.min(selectedIndex, items.length - 1);

        const selectItem = (index: number) => {
            const item = items[index];
            if (item) {
                command(item);
            }
        };

        useImperativeHandle(ref, () => ({
            onKeyDown: ({ event }) => {
                if (items.length === 0) {
                    return false;
                }

                if (event.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
                    return true;
                }

                if (event.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (prev + 1) % items.length);
                    return true;
                }

                if (event.key === 'Enter') {
                    selectItem(activeIndex);
                    return true;
                }

                return false;
            },
        }));

        return (
            <div className="klaud-surface border klaud-border rounded-[var(--rMd)] overflow-hidden min-w-[280px] max-h-[400px] overflow-y-auto">
                {items.length > 0 ? (
                    <div className="p-1">
                        {items.map((item, index) => {
                            const Icon = item.icon;
                            return (
                            <button
                                key={index}
                                type="button"
                                className={`w-full flex items-start gap-3 px-3 py-2 rounded-[var(--rSm)] text-left transition-colors ${index === activeIndex
                                    ? 'bg-[color:var(--surface2)] klaud-text'
                                    : 'klaud-text hover:bg-[color:var(--surface2)]'
                                    }`}
                                onPointerDown={(event) => {
                                    // On touch devices, click can fire after the editor loses selection.
                                    // Execute on pointer down to preserve the suggestion range.
                                    event.preventDefault();
                                    event.stopPropagation();
                                    selectItem(index);
                                }}
                                onClick={(event) => {
                                    // Keyboard activation fallback (detail === 0) without double-triggering pointer taps.
                                    if (event.detail === 0) {
                                        selectItem(index);
                                    }
                                    event.preventDefault();
                                }}
                            >
                                <span className={`mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] border ${index === activeIndex
                                    ? 'border-[color:var(--accent)]/40 bg-[color:var(--surface)] text-[color:var(--accent)]'
                                    : 'border-[color:var(--border2)] bg-[color:var(--surface2)] text-[color:var(--text2)]'
                                    }`}>
                                    <Icon className="h-3.5 w-3.5" />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">{item.title}</div>
                                    <div className="text-xs klaud-muted truncate">{item.description}</div>
                                </div>
                            </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-3 py-2 text-sm klaud-muted">No results</div>
                )}
            </div>
        );
    }
);

CommandMenu.displayName = 'CommandMenu';
