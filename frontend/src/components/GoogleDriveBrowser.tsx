import React, { useState, useEffect } from 'react';
import { Folder, FileMusic, ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { listFiles, getSubfolders, loadFile } from '../lib/googleDrive';
import type { GoogleFile, GoogleFolder } from '../lib/googleDrive';
import { toast } from 'sonner';
import { Button } from './ui/button';

interface GoogleDriveBrowserProps {
  onLoadFile?: (notebook: any, fileId?: string) => void;
  onClose?: () => void;
}

export function GoogleDriveBrowser({ onLoadFile, onClose }: GoogleDriveBrowserProps) {
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [subfolders, setSubfolders] = useState<GoogleFolder[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Array of folder names representing the path
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCurrentFolder();
  }, [currentPath]);

  const loadCurrentFolder = async () => {
    setLoading(true);
    try {
      // Get the current folder name (last in path, or null for root)
      const currentFolder = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
      
      // Load files
      const fileList = await listFiles(null, currentFolder);
      setFiles(fileList);

      // Load subfolders in current folder
      const folderList = await getSubfolders(currentFolder);
      setSubfolders(folderList);
    } catch (error) {
      console.error('Error loading folder:', error);
      toast.error('Failed to load files from Google Drive');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Go to root
      setCurrentPath([]);
    } else {
      // Go to specific breadcrumb
      setCurrentPath(currentPath.slice(0, index + 1));
    }
  };

  const handleFileClick = async (fileId: string) => {
    try {
      const notebook = await loadFile(fileId);
      onLoadFile?.(notebook, fileId);
      onClose?.();
    } catch (error: any) {
      console.error('Error loading file:', error);
      toast.error(error.message || 'Failed to load file from Google Drive');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumbs */}
      {currentPath.length > 0 && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="flex items-center gap-1 text-xs">
            <Button
              onClick={() => handleBreadcrumbClick(-1)}
              variant="ghost"
              size="sm"
              className="font-medium h-auto py-0.5 px-1.5"
            >
              sargamNotes
            </Button>
            {currentPath.map((folderName, index) => (
              <React.Fragment key={index}>
                <span className="text-muted-foreground text-[10px]">/</span>
                <Button
                  onClick={() => handleBreadcrumbClick(index)}
                  variant="ghost"
                  size="sm"
                  className="font-medium truncate max-w-[80px] h-auto py-0.5 px-1.5"
                >
                  {folderName}
                </Button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Subfolders */}
            {subfolders.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {subfolders.map((folder) => (
                  <Button
                    key={folder.id}
                    onClick={() => handleFolderClick(folder.name)}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-auto py-1.5"
                  >
                    <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium truncate flex-1">{folder.name}</span>
                  </Button>
                ))}
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div className="space-y-0.5">
                {subfolders.length > 0 && (
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    Files
                  </div>
                )}
                {files.map((file) => (
                  <Button
                    key={file.id}
                    onClick={() => handleFileClick(file.id)}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-auto py-1.5"
                  >
                    <FileMusic className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col items-start">
                      <div className="text-xs font-medium truncate">{file.name}</div>
                      {file.modifiedTime && (
                        <div className="text-[10px] text-muted-foreground">
                          {formatDate(file.modifiedTime)}
                        </div>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            )}

            {subfolders.length === 0 && files.length === 0 && !loading && (
              <div className="text-center py-6 text-muted-foreground">
                <Folder className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
                <p className="text-xs">No files or folders</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

