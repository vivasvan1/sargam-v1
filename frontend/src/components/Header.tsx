import React, { useState } from 'react';
import {
  FileMusic,
  Pencil,
  Cloud,
  MoreHorizontal,
  Download,
  Printer,
  X,
  Share2,
} from 'lucide-react';
import { Button } from './ui/button';
import { SidebarTrigger } from './ui/sidebar';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './ui/dropdown-menu';
import { getShareableLink } from '@/lib/googleDrive';
import { useNotebookStore } from '@/store/useNotebookStore';
import { useNotebookSettings } from '@/context/NotebookSettingsContext';
import { toast } from 'sonner';

interface HeaderProps {
  title: string;
  onTitleUpdate: (newTitle: string) => void;
  filePath: string;
  googleDriveConnected: boolean;
  onSaveToDrive: () => void;
  onDownload: () => void;
  onPrint: () => void;

  currentFileId?: string | null;
  saveStatus?: 'saved' | 'unsaved' | 'saving';
  isReadOnly?: boolean;
  onCreateCopy?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleUpdate,
  filePath,
  googleDriveConnected,
  onSaveToDrive,
  onDownload,
  onPrint,
  currentFileId,
  saveStatus = 'saved',
  isReadOnly = false,
  onCreateCopy,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const { isPublished } = useNotebookStore();
  const { language, setLanguage } = useNotebookSettings();

  // Removed local metadata fetching effect

  const handleShare = () => {
    if (currentFileId) {
      const link = getShareableLink(currentFileId);
      navigator.clipboard.writeText(link);
      toast.success('Shareable link copied to clipboard');
    }
  };

  return (
    <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm gap-2">
      <SidebarTrigger
        variant="outline"
        className="-ml-2 size-10 md:size-7 [&_svg]:size-5 md:[&_svg]:size-4"
      />

      <div className="max-w-4xl flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 group">
            {isEditingTitle && !isReadOnly ? (
              <Input
                type="text"
                value={title}
                onChange={(e) => onTitleUpdate(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingTitle(false);
                }}
                autoFocus
                className=""
              />
            ) : (
              <>
                <h3
                  onDoubleClick={() => !isReadOnly && setIsEditingTitle(true)}
                  className={`font-bold text-base md:text-xl truncate transition-colors ${!isReadOnly ? 'cursor-text hover:text-primary' : ''}`}
                >
                  {title || 'Untitled Notebook'}
                </h3>
                {!isReadOnly && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-mono truncate hidden md:block">
              {filePath}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {googleDriveConnected && currentFileId && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span
              className={`w-1 h-1 rounded-full ${saveStatus === 'saving' ? 'bg-blue-500' : saveStatus === 'unsaved' ? 'bg-amber-500' : 'bg-green-500'}`}
            />
            {isReadOnly ? (
              <span className="text-muted-foreground">Read Only</span>
            ) : (
              <>
                {saveStatus === 'saving' && (
                  <span className="text-blue-500 animate-pulse">Saving...</span>
                )}
                {saveStatus === 'unsaved' && (
                  <span className="text-amber-500">Unsaved</span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-green-500">Saved</span>
                )}
              </>
            )}
          </span>
        )}
        {isReadOnly && googleDriveConnected && (
          <Button
            onClick={onCreateCopy}
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
          >
            <Cloud className="w-4 h-4" />
            <span className="hidden sm:inline">Create Copy in My Drive</span>
            <span className="sm:hidden">Create Copy</span>
          </Button>
        )}
        {isPublished && (
          <Button
            onClick={handleShare}
            variant="default"
            size="default"
            title="Copy shareable link"
          >
            <Share2 className="w-5 h-5" />
            Share
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="flex">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[180px]"
            sideOffset={5}
            align="end"
          >
            {googleDriveConnected && !isReadOnly && (
              <DropdownMenuItem
                onClick={onSaveToDrive}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                Save to Drive
              </DropdownMenuItem>
            )}
            {googleDriveConnected && isReadOnly && (
              <DropdownMenuItem
                onClick={onCreateCopy}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                Create Copy
              </DropdownMenuItem>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="flex items-center gap-2">
                  <span className="text-xs">🌐</span>
                  Language
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={language}
                  onValueChange={(val) => setLanguage(val as 'en' | 'hi')}
                >
                  <DropdownMenuRadioItem value="en">
                    English
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hi">
                    Hindi
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={onDownload}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onPrint}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print notebook
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
