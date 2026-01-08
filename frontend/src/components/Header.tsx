import React, { useState } from "react";
import {
    FileMusic,
    Pencil,
    Cloud,
    MoreHorizontal,
    Download,
    X,
} from "lucide-react";
import { Button } from "./ui/button";
import { SidebarTrigger } from "./ui/sidebar";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface HeaderProps {
    title: string;
    onTitleUpdate: (newTitle: string) => void;
    filePath: string;
    googleDriveConnected: boolean;
    onSaveToDrive: () => void;
    onDownload: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    title,
    onTitleUpdate,
    filePath,
    googleDriveConnected,
    onSaveToDrive,
    onDownload,
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    return (
        <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm gap-2">
            <SidebarTrigger className="-ml-2 md:inline-flex" />

            <div className="max-w-4xl flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 group">
                        {isEditingTitle ? (
                            <Input
                                type="text"
                                value={title}
                                onChange={(e) => onTitleUpdate(e.target.value)}
                                onBlur={() => setIsEditingTitle(false)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") setIsEditingTitle(false);
                                }}
                                autoFocus
                                className=""
                            />
                        ) : (
                            <>
                                <h3
                                    onDoubleClick={() => setIsEditingTitle(true)}
                                    className="font-bold text-base md:text-xl truncate cursor-text hover:text-primary transition-colors"
                                >
                                    {title || "Untitled Notebook"}
                                </h3>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setIsEditingTitle(true)}
                                >
                                    <Pencil className="w-3 h-3" />
                                </Button>
                            </>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate hidden md:block">
                        {filePath}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
                {googleDriveConnected && (
                    <>
                        <Button onClick={onSaveToDrive} variant="default" size="sm">
                            <Cloud className="w-4 h-4" />
                            <span className="hidden sm:inline">Save to Drive</span>
                        </Button>
                        <Separator
                            orientation="vertical"
                            className="hidden md:block h-4 mx-1"
                        />
                    </>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="hidden md:flex">
                            <MoreHorizontal className="w-5 h-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="min-w-[180px]"
                        sideOffset={5}
                        align="end"
                    >
                        <DropdownMenuItem
                            onClick={onDownload}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <Download className="w-4 h-4" />
                            Download
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};
