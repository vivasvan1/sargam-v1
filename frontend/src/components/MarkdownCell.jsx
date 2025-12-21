import React, { useState } from 'react';
import Markdown from 'react-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '../lib/utils';

export function MarkdownCell({ cell, onChange, theme }) {
    const [editing, setEditing] = useState(false);
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

    const handleChange = (val) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    if (editing) {
        return (
            <div className="p-1 overflow-hidden">
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
        );
    }

    return (
        <div
            className="p-6 cursor-text min-h-[80px]"
            onDoubleClick={() => setEditing(true)}
        >
            <div className={cn(
                "prose prose-sm max-w-none prose-headings:font-bold prose-p:text-muted-foreground/90 prose-p:leading-relaxed",
                theme === 'dark' && "prose-invert"
            )}>
                <Markdown>{content || '*Double click to edit cell...*'}</Markdown>
            </div>
        </div>
    );
}
