import React from "react";
import { Layout, Plus } from "lucide-react";
import { Button } from "./ui/button";

interface EmptyStateProps {
    onAddMusic: () => void;
    onAddMarkdown: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    onAddMusic,
    onAddMarkdown,
}) => {
    return (
        <div className="border-2 border-dashed border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <Layout className="w-10 h-10 md:w-12 md:h-12 opacity-20" />
            <div className="text-center">
                <p className="font-medium text-sm md:text-base">
                    No cells in this notebook
                </p>
                <p className="text-xs md:text-sm">Add a cell to start creating music</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
                <Button
                    onClick={onAddMusic}
                    variant="default"
                    size="lg"
                    className="min-h-[44px]"
                >
                    <Plus className="w-4 h-4" />
                    Music Cell
                </Button>
                <Button
                    onClick={onAddMarkdown}
                    variant="secondary"
                    size="lg"
                    className="min-h-[44px]"
                >
                    <Plus className="w-4 h-4" />
                    Markdown Cell
                </Button>
            </div>
        </div>
    );
};
