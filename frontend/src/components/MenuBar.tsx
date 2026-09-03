import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { ExternalLink, Minus, Pause, Play, Plus } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { Button } from './ui/button';
import { ButtonGroup, ButtonGroupText } from './ui/button-group';
import { GlobalZoomDialog } from './GlobalZoomDialog';

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
  isPlayingAll?: boolean;
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
  isPlayingAll,
}: MenuBarProps) {
  const { open, toggleSidebar } = useSidebar();
  const {
    showVisualizer,
    toggleVisualizer,
    showCode,
    toggleCode,
    autoSaveEnabled,
    toggleAutoSave,
    globalZoomLevel,
    setGlobalZoomLevel,
  } = useNotebookSettings();
  const [isCustomZoomOpen, setIsCustomZoomOpen] = useState(false);

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
            <MenubarSub>
              <MenubarSubTrigger>
                <span>Set Global Zoom Level</span>
                <span className="text-muted-foreground ml-auto pl-4 pr-1 text-xs font-mono">
                  {Math.round(globalZoomLevel * 100)}%
                </span>
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  onClick={() => setGlobalZoomLevel((z) => Math.min(3, z + 0.25))}
                  disabled={globalZoomLevel >= 3}
                >
                  Zoom In (+25%)
                </MenubarItem>
                <MenubarItem
                  onClick={() => setGlobalZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  disabled={globalZoomLevel <= 0.5}
                >
                  Zoom Out (-25%)
                </MenubarItem>
                <MenubarSeparator />
                <MenubarRadioGroup
                  value={String(Math.round(globalZoomLevel * 100))}
                  onValueChange={(val) => setGlobalZoomLevel(Number(val) / 100)}
                >
                  <MenubarRadioItem value="50">50%</MenubarRadioItem>
                  <MenubarRadioItem value="75">75%</MenubarRadioItem>
                  <MenubarRadioItem value="100">100% (Default)</MenubarRadioItem>
                  <MenubarRadioItem value="125">125%</MenubarRadioItem>
                  <MenubarRadioItem value="150">150%</MenubarRadioItem>
                  <MenubarRadioItem value="175">175%</MenubarRadioItem>
                  <MenubarRadioItem value="200">200%</MenubarRadioItem>
                  <MenubarRadioItem value="250">250%</MenubarRadioItem>
                  <MenubarRadioItem value="300">300%</MenubarRadioItem>
                </MenubarRadioGroup>
                <MenubarSeparator />
                <MenubarItem onClick={() => setIsCustomZoomOpen(true)}>
                  Custom Zoom...
                </MenubarItem>
                <MenubarItem
                  onClick={() => setGlobalZoomLevel(1)}
                  disabled={globalZoomLevel === 1}
                >
                  Reset to 100%
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
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
              {isPlayingAll ? 'Stop Play All' : 'Play All Cells'}
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

      <GlobalZoomDialog
        open={isCustomZoomOpen}
        onOpenChange={setIsCustomZoomOpen}
      />
    </div>
  );
}
