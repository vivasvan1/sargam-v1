import React, { useState } from 'react';
import Markdown from 'react-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '../lib/utils';
import { useMobileDevice } from '../hooks/useMobileDevice';

export function MarkdownCell({ cell, onChange, theme }) {
    const [editing, setEditing] = useState(false);
    const isMobileDevice = useMobileDevice();
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

    const handleChange = (val) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    const handleTap = (e) => {
        if (isMobileDevice) {
            // On mobile, single tap enters edit mode
            // But allow links and other interactive elements to work
            const target = e.target;
            // If clicking on a link or button, don't enter edit mode
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a, button')) {
                return;
            }
            setEditing(true);
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
            aria-label="Tap to edit markdown cell"
        >
            <div className={cn(
                "prose prose-sm max-w-none prose-headings:font-bold",
                theme === 'dark' && "prose-invert"
            )}>
                <Markdown>{content || (isMobileDevice ? '*Tap to edit cell...*' : '*Double click to edit cell...*')}</Markdown>
            </div>
        </div>
    );
}
