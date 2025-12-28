import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Folder, FileMusic, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { listFiles, loadFile, getSubfolders } from '../lib/googleDrive';
import type { GoogleFile, GoogleFolder } from '../lib/googleDrive';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface GoogleDriveLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad?: (notebook: any, fileId?: string) => void;
}

interface Breadcrumb {
  name: string;
  isRoot: boolean;
}

export function GoogleDriveLoadDialog({ open, onOpenChange, onLoad }: GoogleDriveLoadDialogProps) {
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [subfolders, setSubfolders] = useState<GoogleFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null); // null = root, string = subfolder name
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

  useEffect(() => {
    if (open) {
      loadCurrentFolder();
    } else {
      // Reset state when dialog closes
      setCurrentFolder(null);
      setSelectedFileId(null);
      setBreadcrumbs([]);
    }
  }, [open, currentFolder]);

  const loadCurrentFolder = async () => {
    setLoadingFiles(true);
    try {
      // Load files
      const fileList = await listFiles(null, currentFolder);
      setFiles(fileList);

      // Load subfolders if in root
      if (currentFolder === null) {
        const folderList = await getSubfolders();
        setSubfolders(folderList);
      } else {
        setSubfolders([]);
      }
    } catch (error) {
      console.error('Error loading folder:', error);
      toast.error('Failed to load files from Google Drive');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleFolderClick = (folderName: string) => {
    setBreadcrumbs([...breadcrumbs, { name: folderName, isRoot: false }]);
    setCurrentFolder(folderName);
    setSelectedFileId(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Go to root
      setCurrentFolder(null);
      setBreadcrumbs([]);
    } else {
      // Go to specific breadcrumb
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      setBreadcrumbs(newBreadcrumbs);
      if (newBreadcrumbs.length === 0) {
        setCurrentFolder(null);
      } else {
        setCurrentFolder(newBreadcrumbs[newBreadcrumbs.length - 1].name);
      }
    }
    setSelectedFileId(null);
  };

  const handleLoad = async () => {
    if (!selectedFileId) {
      toast.error('Please select a file to load');
      return;
    }

    setLoading(true);
    try {
      const notebook = await loadFile(selectedFileId);
      onLoad?.(notebook, selectedFileId); // Pass both notebook and file ID
      toast.success('Notebook loaded from Google Drive');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error loading file:', error);
      toast.error(error.message || 'Failed to load file from Google Drive');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-6 shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileMusic className="w-5 h-5" />
            Load from Google Drive
          </DialogTitle>
        </div>

          {/* Breadcrumbs */}
          <div className="mb-4 flex items-center gap-2 text-sm shrink-0">
            <Button
              onClick={() => handleBreadcrumbClick(-1)}
              variant="ghost"
              size="sm"
              className={cn(
                currentFolder === null && "font-semibold"
              )}
            >
              sargamNotes
            </Button>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                <span className="text-muted-foreground">/</span>
                <Button
                  onClick={() => handleBreadcrumbClick(index)}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    index === breadcrumbs.length - 1 && "font-semibold"
                  )}
                >
                  {crumb.name}
                </Button>
              </React.Fragment>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
            {loadingFiles ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Subfolders */}
                {subfolders.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Folders
                    </h3>
                    {subfolders.map((folder) => (
                      <Button
                        key={folder.id}
                        onClick={() => handleFolderClick(folder.name)}
                        variant="ghost"
                        size="default"
                        className="w-full justify-start"
                      >
                        <Folder className="w-5 h-5 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{folder.name}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}

                {/* Files */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {subfolders.length > 0 && (
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4">
                        Files
                      </h3>
                    )}
                    {files.map((file) => (
                      <Button
                        key={file.id}
                        onClick={() => setSelectedFileId(file.id)}
                        variant="ghost"
                        size="default"
                        className={cn(
                          "w-full justify-start",
                          selectedFileId === file.id && "bg-primary/10 border border-primary"
                        )}
                      >
                        <FileMusic className="w-5 h-5 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{file.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Modified: {formatDate(file.modifiedTime)}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}

                {subfolders.length === 0 && files.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Folder className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No files or folders in this directory</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3 shrink-0 border-t border-border pt-4">
            <DialogClose asChild>
              <Button
                variant="secondary"
                size="default"
                disabled={loading}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleLoad}
              disabled={loading || !selectedFileId}
              variant="default"
              size="default"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <FileMusic className="w-4 h-4" />
                  Load
                </>
              )}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}

