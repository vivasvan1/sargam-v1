import React, { useState, useRef } from 'react';
import Markdown from 'react-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '../lib/utils';
import { useMobileDevice } from '../hooks/useMobileDevice';

export function MarkdownCell({ cell, onChange, theme }) {
    const [editing, setEditing] = useState(false);
    const isMobileDevice = useMobileDevice();
    const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

    const handleChange = (val) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    const handleTap = (e) => {
        if (isMobileDevice) {
            // On mobile, detect double tap
            // But allow links and other interactive elements to work
            const target = e.target;
            // If clicking on a link or button, don't enter edit mode
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a, button')) {
                return;
            }

            const now = Date.now();
            const timeDiff = now - lastTapRef.current.time;
            const x = e.clientX || e.touches?.[0]?.clientX || 0;
            const y = e.clientY || e.touches?.[0]?.clientY || 0;
            const distance = Math.sqrt(
                Math.pow(x - lastTapRef.current.x, 2) + Math.pow(y - lastTapRef.current.y, 2)
            );

            // If second tap within 300ms and within 50px, treat as double tap
            if (timeDiff < 300 && distance < 50) {
                e.preventDefault();
                setEditing(true);
                lastTapRef.current = { time: 0, x: 0, y: 0 }; // Reset
            } else {
                lastTapRef.current = { time: now, x, y };
            }
        }
    };

    const handleDoubleClick = (e) => {
        // On desktop, double click enters edit mode
        if (!isMobileDevice) {
            setEditing(true);
        }
    };

    if (editing) {
        return (
            <div className="p-1 overflow-x-auto max-w-full">
                <div className="min-w-0">
                    <CodeMirror
                        value={content}
                        minHeight="100px"
                        extensions={[markdown()]}
                        onChange={handleChange}
                        onBlur={() => setEditing(false)}
                        autoFocus={true}
                        theme={theme}
                        className="rounded-lg overflow-hidden border-none text-sm"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="p-4 md:p-6 cursor-text min-h-[80px] overflow-x-auto max-w-full touch-manipulation"
            onClick={handleTap}
            onDoubleClick={handleDoubleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditing(true);
                }
            }}
            aria-label="Double tap to edit markdown cell"
        >
            <div className={cn(
                "prose prose-sm max-w-none prose-headings:font-bold",
                theme === 'dark' && "prose-invert"
            )}>
                <Markdown>{content || (isMobileDevice ? '*Double tap to edit cell...*' : '*Double click to edit cell...*')}</Markdown>
            </div>
        </div>
    );
}
