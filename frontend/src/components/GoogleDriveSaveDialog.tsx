import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Save, Folder } from 'lucide-react';
import { cn } from '../lib/utils';
import { getSubfolders, saveFile } from '../lib/googleDrive';
import type { GoogleFolder } from '../lib/googleDrive';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Notebook {
  imnb_version: number;
  metadata: {
    title?: string;
  };
  cells: any[];
}

interface GoogleDriveSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebook: Notebook;
  onSave?: (fileId: string) => void;
}

export function GoogleDriveSaveDialog({ open, onOpenChange, notebook, onSave }: GoogleDriveSaveDialogProps) {
  const [fileName, setFileName] = useState('');
  const [subfolderOption, setSubfolderOption] = useState('none');
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const [subfolders, setSubfolders] = useState<GoogleFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubfolders, setLoadingSubfolders] = useState(false);

  // Initialize filename from notebook title
  useEffect(() => {
    if (notebook?.metadata?.title) {
      setFileName(notebook.metadata.title);
    } else {
      setFileName('untitled');
    }
  }, [notebook]);

  // Load subfolders when dialog opens
  useEffect(() => {
    if (open) {
      loadSubfolders();
    }
  }, [open]);

  const loadSubfolders = async () => {
    setLoadingSubfolders(true);
    try {
      const folders = await getSubfolders();
      setSubfolders(folders);
    } catch (error) {
      console.error('Error loading subfolders:', error);
      toast.error('Failed to load subfolders');
    } finally {
      setLoadingSubfolders(false);
    }
  };

  const handleSave = async () => {
    if (!fileName.trim()) {
      toast.error('Please enter a file name');
      return;
    }

    if (subfolderOption === 'new' && !newSubfolderName.trim()) {
      toast.error('Please enter a subfolder name');
      return;
    }

    setLoading(true);
    try {
      const content = JSON.stringify(notebook, null, 2);
      const subfolder = subfolderOption === 'new' 
        ? newSubfolderName.trim() 
        : subfolderOption === 'none' 
        ? null 
        : subfolderOption;

      const result = await saveFile(fileName, content, subfolder);
      
      toast.success('Notebook saved to Google Drive');
      onSave?.(result.id); // Pass file ID to parent
      onOpenChange(false);
      
      // Reset form
      setSubfolderOption('none');
      setNewSubfolderName('');
    } catch (error: any) {
      console.error('Error saving file:', error);
      toast.error(error.message || 'Failed to save file to Google Drive');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-center justify-between mb-6">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save to Google Drive
          </DialogTitle>
        </div>

          <div className="space-y-4">
            {/* File Name */}
            <div className="space-y-2">
              <label htmlFor="fileName" className="text-sm font-semibold">
                File Name
              </label>
              <input
                id="fileName"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter file name"
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                File will be saved as: {fileName || 'untitled'}.imnb
              </p>
            </div>

            {/* Subfolder Selection */}
            <div className="space-y-2">
              <label htmlFor="subfolder" className="text-sm font-semibold flex items-center gap-2">
                <Folder className="w-4 h-4" />
                Subfolder (Optional)
              </label>
              <select
                id="subfolder"
                value={subfolderOption}
                onChange={(e) => setSubfolderOption(e.target.value)}
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading || loadingSubfolders}
              >
                <option value="none">No subfolder (save in root)</option>
                {subfolders.map((folder) => (
                  <option key={folder.id} value={folder.name}>
                    {folder.name}
                  </option>
                ))}
                <option value="new">+ Create new subfolder</option>
              </select>

              {subfolderOption === 'new' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={newSubfolderName}
                    onChange={(e) => setNewSubfolderName(e.target.value)}
                    placeholder="Enter subfolder name"
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
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
              onClick={handleSave}
              disabled={loading || !fileName.trim()}
              variant="default"
              size="default"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  );
}

