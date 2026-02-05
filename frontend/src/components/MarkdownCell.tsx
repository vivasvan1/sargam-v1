import React, { useState, useRef } from 'react';
import Markdown from 'react-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '../lib/utils';
import { useMobileDevice } from '../hooks/useMobileDevice';
import { AspectRatio } from './ui/aspect-ratio';

interface MarkdownCellProps {
    cell: {
        cell_type: string;
        source: string[] | string;
        [key: string]: any;
    };
    onChange: (cell: any) => void;
    theme: string;
    onFocus?: () => void;
}

function getYouTubeId(url: string) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function YouTubeEmbed({ id }: { id: string }) {
    return (
        <div className="my-4 rounded-lg overflow-hidden border border-border shadow-sm">
            <AspectRatio ratio={16 / 9}>
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${id}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full"
                ></iframe>
            </AspectRatio>
        </div>
    );
}

export function MarkdownCell({ cell, onChange, theme, onFocus }: MarkdownCellProps) {
    const [editing, setEditing] = useState(false);
    const isMobileDevice = useMobileDevice();
    const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
    const content = Array.isArray(cell.source) ? cell.source.join('\n') : cell.source;

    const handleChange = (val: string) => {
        onChange({ ...cell, source: val.split('\n') });
    };

    const handleTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (isMobileDevice) {
            // On mobile, detect double tap
            // But allow links and other interactive elements to work
            const target = e.target as HTMLElement;
            // If clicking on a link or button, don't enter edit mode
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a, button')) {
                return;
            }

            const now = Date.now();
            const timeDiff = now - lastTapRef.current.time;
            const x = 'clientX' in e ? e.clientX : (e.touches?.[0]?.clientX || 0);
            const y = 'clientY' in e ? e.clientY : (e.touches?.[0]?.clientY || 0);
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

    const handleDoubleClick = () => {
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
                        onFocus={onFocus}
                        theme={theme === 'dark' ? 'dark' : 'light'}
                        className="rounded-lg overflow-hidden border-none text-base md:text-sm"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="p-4 md:p-6 cursor-text min-h-[80px] overflow-x-auto max-w-full touch-manipulation"
            onClick={(e) => {
                onFocus?.();
                handleTap(e);
            }}
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
                <Markdown
                    components={{
                        a: ({ node, ...props }) => {
                            const videoId = getYouTubeId(props.href || '');
                            const isYouTubeLink = props.children === 'youtube' || props.children?.toString().toLocaleLowerCase() === 'youtube';

                            if (videoId && isYouTubeLink) {
                                return <YouTubeEmbed id={videoId} />;
                            }
                            return <a {...props} target="_blank" rel="noopener noreferrer" />;
                        }
                    }}
                >
                    {content || (isMobileDevice ? '*Double tap to edit cell...*' : '*Double click to edit cell...*')}
                </Markdown>
            </div>
        </div>
    );
}

