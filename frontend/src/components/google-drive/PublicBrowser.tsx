import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  fetchPublicRegistry,
  loadRegistryNotebook,
} from '@/lib/googleDrive';
import type { RegistryEntry } from '@/lib/googleDrive';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '../ui/separator';

interface PublicBrowserProps {
  onLoadFile?: (
    notebook: any,
    fileId?: string,
    isReadOnly?: boolean,
    isPublished?: boolean,
    ownerEmail?: string
  ) => void;
  onClose?: () => void;
  currentFileId?: string | null;
}

const PAGE_SIZE = 10;

export function PublicBrowser({
  onLoadFile,
  onClose,
  currentFileId,
}: PublicBrowserProps) {
  const [files, setFiles] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPublicRegistry(
        debouncedSearch,
        currentPage,
        PAGE_SIZE
      );
      setFiles(result.files);
      setTotalFiles(result.total);
    } catch (error) {
      console.error('Error loading public registry:', error);
      toast.error('Failed to load public community files');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, currentPage]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const handleFileClick = async (fileId: string) => {
    setOpeningId(fileId);
    try {
      const { notebook, entry } = await loadRegistryNotebook(fileId);
      onLoadFile?.(notebook, fileId, true, true, entry.ownerEmail);
      onClose?.();
      console.debug('Public notebook loaded');
    } catch (error: any) {
      console.error('Error loading file:', error);
      toast.error(error.message || 'Failed to open file');
    } finally {

      setOpeningId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (e) {
      return '';
    }
  };

  const totalPages = Math.ceil(totalFiles / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search community..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <Separator className="my-2" />

      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {files.length > 0 ? (
              <div className="space-y-0.5">
                {files.map((file) => (
                  <Button
                    key={file.id}
                    onClick={() => handleFileClick(file.id)}
                    variant={currentFileId === file.id ? 'secondary' : 'ghost'}
                    className="group flex flex-col items-start border w-full h-auto py-2 px-2 gap-1"
                  >
                    <div className="flex items-center w-full gap-2">
                      <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-sm font-medium truncate flex-1 text-left">
                        {file.name}
                      </span>
                      {openingId === file.id && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                    </div>

                    <div className="flex justify-between w-full text-[10px] text-muted-foreground pl-5.5">
                      <span className="truncate max-w-[100px]">
                        by {file.author}
                      </span>
                      <span>{formatDate(file.date)}</span>
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Globe className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
                <p className="text-xs">No public notebooks found</p>
              </div>
            )}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-2 py-2 shrink-0 flex items-center justify-between border-t mt-auto">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === 1 || loading}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-7 px-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage === totalPages || loading}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 px-2"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
