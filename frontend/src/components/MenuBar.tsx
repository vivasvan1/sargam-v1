import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar';
import type { Dispatch, SetStateAction } from 'react';
import { ExternalLink, Minus, Pause, Play, Plus } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from './ui/button';
import { ButtonGroup, ButtonGroupText } from './ui/button-group';

interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void; // This clicks the hidden file input
  onSaveDrive: () => void;
  onLoadDrive: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  isPublished: boolean;
  isReadOnly: boolean;
  onDownload: () => void;
  onPrint: () => void;
  currentFileId?: string | null;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  onAddMusic: () => void;
  onAddMarkdown: () => void;

  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  isAutoScrolling: boolean;
  autoScrollSpeed: number;
  setAutoScrollSpeed: Dispatch<SetStateAction<number>>;
  onToggleAutoScroll: () => void;

  googleDriveConnected: boolean;

  onPlayCell?: () => void;
  onPlayAll?: () => void;
}

import { useNotebookSettings } from '../context/NotebookSettingsContext';

export function MenuBar({
  onNew,
  onOpen,
  onSaveDrive,
  onLoadDrive,
  onPublish,
  onUnpublish,
  isPublished,
  isReadOnly,
  onDownload,
  onPrint,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddMusic,
  onAddMarkdown,
  setTheme,
  isAutoScrolling,
  autoScrollSpeed,
  setAutoScrollSpeed,
  onToggleAutoScroll,
  googleDriveConnected,
  currentFileId,
  onPlayCell,
  onPlayAll,
}: MenuBarProps) {
  const { open, toggleSidebar } = useSidebar();
  const {
    showVisualizer,
    toggleVisualizer,
    showCode,
    toggleCode,
    autoSaveEnabled,
    toggleAutoSave,
  } = useNotebookSettings();

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Menubar className="min-w-0 border-none bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">
            File
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onNew}>
              New Notebook <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onOpen}>
              Open Local... <MenubarShortcut>⌘O</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onSaveDrive} disabled={!googleDriveConnected}>
              Save to Drive <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onLoadDrive}>Load from Drive</MenubarItem>
            {isPublished ? (
              <MenubarItem
                onClick={onUnpublish}
                disabled={!googleDriveConnected || !currentFileId || isReadOnly}
              >
                Unpublish from Community
              </MenubarItem>
            ) : (
              <MenubarItem
                onClick={onPublish}
                disabled={!googleDriveConnected || !currentFileId || isReadOnly}
              >
                Publish to Community
              </MenubarItem>
            )}
            <MenubarSeparator />
            <MenubarItem onClick={toggleAutoSave}>
              {autoSaveEnabled ? 'Disable' : 'Enable'} Auto Save
            </MenubarItem>
            <MenubarItem onClick={onDownload}>Download .imnb</MenubarItem>
            <MenubarItem onClick={onPrint}>
              Print Notebook <MenubarShortcut>⌘P</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">
            Edit
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onUndo} disabled={!canUndo || isReadOnly}>
              Undo Cell Change <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={onRedo} disabled={!canRedo || isReadOnly}>
              Redo Cell Change <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onAddMusic} disabled={isReadOnly}>
              Add Music Cell
            </MenubarItem>
            <MenubarItem onClick={onAddMarkdown} disabled={isReadOnly}>
              Add Markdown Cell
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">
            View
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={toggleSidebar}>
              {open ? 'Hide' : 'Show'} Sidebar{' '}
              <MenubarShortcut>⌘B</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={toggleVisualizer}>
              {showVisualizer ? 'Hide' : 'Show'} All Visualizers
            </MenubarItem>
            <MenubarItem onClick={toggleCode}>
              {showCode ? 'Hide' : 'Show'} All Code
            </MenubarItem>
            <MenubarItem onClick={onToggleAutoScroll}>
              {isAutoScrolling ? 'Stop' : 'Start'} Auto Scroll{' '}
              <MenubarShortcut>Space</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => setTheme('dark')}>
              Dark Mode
            </MenubarItem>
            <MenubarItem onClick={() => setTheme('light')}>
              Light Mode
            </MenubarItem>
            <MenubarItem onClick={() => setTheme('system')}>
              System Theme
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">
            Play
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onPlayCell} disabled={!onPlayCell}>
              Play Cell
            </MenubarItem>
            <MenubarItem onClick={onPlayAll} disabled={!onPlayAll}>
              Play All Cells
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="cursor-pointer font-normal text-sm h-7 px-2 data-[state=open]:bg-muted">
            Help
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              About Speede Sargam{' '}
              <span className="ml-2 text-xs text-muted-foreground">v1.0</span>
            </MenubarItem>
            <MenubarItem
              onClick={() =>
                window.open(
                  'https://github.com/vivasvan-patel/sargam-v1',
                  '_blank'
                )
              }
            >
              GitHub <ExternalLink className="w-3 h-3 ml-2" />
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <ButtonGroup className="shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleAutoScroll}
          className="h-7 px-2 text-xs"
          aria-label={
            isAutoScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'
          }
        >
          {isAutoScrolling ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {isAutoScrolling ? 'Stop' : 'Scroll'}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setAutoScrollSpeed((speed) => Math.max(5, speed - 5))}
          className="size-7 text-muted-foreground"
          aria-label="Decrease auto-scroll speed"
        >
          <Minus className="size-3.5" />
        </Button>
        <ButtonGroupText
          className="h-7 min-w-8 justify-center border-y px-1 text-[11px] font-semibold tabular-nums text-muted-foreground"
          aria-label={`Auto-scroll speed ${autoScrollSpeed}`}
        >
          {autoScrollSpeed}
        </ButtonGroupText>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setAutoScrollSpeed((speed) => Math.min(50, speed + 5))}
          className="size-7 text-muted-foreground"
          aria-label="Increase auto-scroll speed"
        >
          <Plus className="size-3.5" />
        </Button>
      </ButtonGroup>
    </div>
  );
}
