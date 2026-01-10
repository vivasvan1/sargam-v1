import React from "react";
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarShortcut,
    MenubarTrigger,
} from "@/components/ui/menubar";
import { ExternalLink } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

interface MenuBarProps {
    onNew: () => void;
    onOpen: () => void; // This clicks the hidden file input
    onSaveDrive: () => void;
    onLoadDrive: () => void;
    onPublish: () => void;
    onDownload: () => void;
    currentFileId?: string | null;

    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;

    onAddMusic: () => void;
    onAddMarkdown: () => void;

    theme: "light" | "dark" | "system";
    setTheme: (theme: "light" | "dark" | "system") => void;

    googleBacked: boolean;
}

import { useNotebookSettings } from "../context/NotebookSettingsContext";

export function MenuBar({
    onNew,
    onOpen,
    onSaveDrive,
    onLoadDrive,
    onPublish,
    onDownload,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onAddMusic,
    onAddMarkdown,
    theme,
    setTheme,
    googleBacked,
    currentFileId,
}: MenuBarProps) {
    const { open, toggleSidebar } = useSidebar();
    const { showVisualizer, toggleVisualizer, showCode, toggleCode } = useNotebookSettings();

    return (
        <Menubar className="border-none bg-transparent h-auto p-0 shadow-none">
            <MenubarMenu>
                <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">File</MenubarTrigger>
                <MenubarContent>
                    <MenubarItem onClick={onNew}>
                        New Notebook <MenubarShortcut>⌘N</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem onClick={onOpen}>
                        Open Local... <MenubarShortcut>⌘O</MenubarShortcut>
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem onClick={onSaveDrive} disabled={!googleBacked}>
                        Save to Drive <MenubarShortcut>⌘S</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem onClick={onLoadDrive}>
                        Load from Drive
                    </MenubarItem>
                    <MenubarItem onClick={onPublish} disabled={!googleBacked || !currentFileId}>
                        Publish to Community
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem onClick={onDownload}>
                        Download .imnb
                    </MenubarItem>
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">Edit</MenubarTrigger>
                <MenubarContent>
                    <MenubarItem onClick={onUndo} disabled={!canUndo}>
                        Undo Cell Change <MenubarShortcut>⌘Z</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem onClick={onRedo} disabled={!canRedo}>
                        Redo Cell Change <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem onClick={onAddMusic}>Add Music Cell</MenubarItem>
                    <MenubarItem onClick={onAddMarkdown}>Add Markdown Cell</MenubarItem>
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">View</MenubarTrigger>
                <MenubarContent>
                    <MenubarItem onClick={toggleSidebar}>
                        {open ? "Hide" : "Show"} Sidebar <MenubarShortcut>⌘B</MenubarShortcut>
                    </MenubarItem>
                    <MenubarItem onClick={toggleVisualizer}>
                        {showVisualizer ? "Hide" : "Show"} All Visualizers
                    </MenubarItem>
                    <MenubarItem onClick={toggleCode}>
                        {showCode ? "Hide" : "Show"} All Code
                    </MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem onClick={() => setTheme("dark")}>Dark Mode</MenubarItem>
                    <MenubarItem onClick={() => setTheme("light")}>Light Mode</MenubarItem>
                    <MenubarItem onClick={() => setTheme("system")}>System Theme</MenubarItem>
                </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
                <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">Help</MenubarTrigger>
                <MenubarContent>
                    <MenubarItem disabled>
                        About Sargam <span className="ml-2 text-xs text-muted-foreground">v1.0</span>
                    </MenubarItem>
                    <MenubarItem onClick={() => window.open("https://github.com/vivasvan-patel/sargam-v1", "_blank")}>
                        GitHub <ExternalLink className="w-3 h-3 ml-2" />
                    </MenubarItem>
                </MenubarContent>
            </MenubarMenu>
        </Menubar>
    );
}
