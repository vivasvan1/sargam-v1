import React, { useState, useEffect } from 'react';
import { Folder, FileMusic, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listFiles, getSubfolders, loadFile, deleteFile } from '@/lib/googleDrive';
import type { GoogleFile, GoogleFolder } from '@/lib/googleDrive';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GoogleDriveBrowserProps {
  onLoadFile?: (notebook: any, fileId?: string) => void;
  onClose?: () => void;
  currentFileId?: string | null;
}

export function GoogleDriveBrowser({ onLoadFile, onClose, currentFileId }: GoogleDriveBrowserProps) {
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [subfolders, setSubfolders] = useState<GoogleFolder[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Array of folder names representing the path
  const [loading, setLoading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteFile = async () => {
    if (!deletingFileId) return;

    setIsDeleting(true);
    try {
      await deleteFile(deletingFileId);
      toast.success('File deleted successfully');
      // Refresh the file list
      loadCurrentFolder();
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast.error(error.message || 'Failed to delete file');
    } finally {
      setIsDeleting(false);
      setDeletingFileId(null);
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
                {files.length > 0 && (
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    Files
                  </div>
                )}
                {files.map((file) => (
                  <div key={file.id} className="group relative flex items-center w-full min-w-0">
                    <Button
                      onClick={() => handleFileClick(file.id)}
                      variant={currentFileId === file.id ? "default" : "ghost"}
                      title={file.name}
                      size="sm"
                      className="flex-1 min-w-0 justify-start h-auto py-1.5 pr-8 gap-2"
                    >
                      <FileMusic className="w-3.5 h-3.5 shrink-0" />
                      <div className="flex-1 min-w-0 flex flex-col items-start pr-8">
                        <div className="text-xs font-medium truncate w-full text-left">
                          {file.name}
                        </div>
                        {file.modifiedTime && (
                          <div className="text-[10px] text-muted-foreground">
                            {formatDate(file.modifiedTime)}
                          </div>
                        )}
                      </div>
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingFileId(file.id);
                      }}
                      variant="outline"
                      size="icon"
                      className="absolute right-1.5 h-7 w-7 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 transition-opacity"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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

      <AlertDialog open={!!deletingFileId} onOpenChange={(open) => !open && setDeletingFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the notebook from your Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteFile();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

