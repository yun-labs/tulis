'use client';

import { useState } from 'react';

interface DatePickerProps {
    onSelect: (date: Date) => void;
    onClose: () => void;
}

export const DatePicker = ({ onSelect, onClose }: DatePickerProps) => {
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
    }

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(viewDate);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[2px]" onClick={onClose}>
            <div
                className="w-full max-w-[320px] rounded-3xl border klaud-border bg-[color:var(--klaud-surface)] shadow-2xl animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={prevMonth}
                            className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 klaud-text transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <div className="text-center">
                            <h3 className="font-black klaud-text tracking-tight">{monthName}</h3>
                            <p className="text-[10px] uppercase tracking-widest klaud-muted font-bold opacity-50">{year}</p>
                        </div>
                        <button
                            onClick={nextMonth}
                            className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 klaud-text transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                            <div key={i} className="text-[10px] font-black text-center klaud-muted opacity-40 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((date, i) => {
                            if (!date) return <div key={i} />;

                            const isToday = new Date().toDateString() === date.toDateString();
                            const isSelected = selectedDate?.toDateString() === date.toDateString();

                            return (
                                <button
                                    key={i}
                                    onClick={() => {
                                        setSelectedDate(date);
                                        onSelect(date);
                                    }}
                                    className={`
                                        aspect-square flex items-center justify-center text-sm font-bold rounded-xl transition-all
                                        ${isSelected
                                            ? 'bg-[color:var(--klaud-accent)] text-white shadow-lg shadow-cyan-500/20 scale-105'
                                            : isToday
                                                ? 'bg-[color:var(--klaud-accent)]/10 text-[color:var(--klaud-accent)]'
                                                : 'klaud-text hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="border-t klaud-border p-4 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold klaud-muted hover:klaud-text transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSelect(new Date())}
                        className="px-4 py-2 text-xs font-bold text-[color:var(--klaud-accent)] hover:bg-[color:var(--klaud-accent)]/5 rounded-lg transition-colors"
                    >
                        Today
                    </button>
                </div>
            </div>
        </div>
    );
};
