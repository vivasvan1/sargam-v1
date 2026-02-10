import { forwardRef } from "react";

interface VisualizerPlayheadProps {
    lineProgress: number;
    pixelsPerSecond: number;
}

export const VisualizerPlayhead = forwardRef<HTMLDivElement, VisualizerPlayheadProps>(
    ({ lineProgress, pixelsPerSecond }, ref) => {
        return (
            <div
                ref={ref}
                className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-primary z-20 pointer-events-none"
                style={{
                    transform: `translateX(${lineProgress * pixelsPerSecond}px)`,
                    willChange: "transform",
                    boxShadow: "0 0 12px 2px rgba(var(--primary), 0.4)",
                }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
            </div>
        );
    }
);

VisualizerPlayhead.displayName = "VisualizerPlayhead";
