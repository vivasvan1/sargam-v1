import { useState, useEffect } from 'react';
import { Globe, Loader2, Search } from 'lucide-react';
import { fetchPublicRegistry, loadFile } from '@/lib/googleDrive';
import type { RegistryEntry } from '@/lib/googleDrive';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '../ui/separator';

interface PublicBrowserProps {
    onLoadFile?: (notebook: any, fileId?: string) => void;
    onClose?: () => void;
    currentFileId?: string | null;
}

export function PublicBrowser({ onLoadFile, onClose, currentFileId }: PublicBrowserProps) {
    const [files, setFiles] = useState<RegistryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [openingId, setOpeningId] = useState<string | null>(null);

    useEffect(() => {
        loadRegistry();
    }, []);

    const loadRegistry = async () => {
        setLoading(true);
        try {
            const data = await fetchPublicRegistry();
            setFiles(data);
        } catch (error) {
            console.error('Error loading public registry:', error);
            toast.error('Failed to load public community files');
        } finally {
            setLoading(false);
        }
    };

    const handleFileClick = async (fileId: string) => {
        setOpeningId(fileId);
        try {
            // NOTE: loadFile uses gapi.client.drive which requires auth.
            // If the user is NOT authenticated, this might fail or we might need a non-auth fallback 
            // (using API key only, or just `fetch` on the public link if CORS allows).
            // For now, we assume the user is logged in significantly simplifies things, 
            // but strictly speaking "public" files should be viewable without auth if we used a simple fetch.
            // However, `loadFile` in googleDrive.ts is built around `gapi.client`.

            const notebook = await loadFile(fileId);
            onLoadFile?.(notebook, fileId);
            onClose?.();
            console.debug("Public notebook loaded");
        } catch (error: any) {
            console.error('Error loading file:', error);
            toast.error(error.message || 'Failed to open file. You might need to sign in to Google Drive first.');
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

    const filteredFiles = files.filter(file =>
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.author.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

            <Separator className='my-2' />

            <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1 space-y-0.5">
                {loading ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {filteredFiles.length > 0 ? (
                            <div className="space-y-0.5">
                                {filteredFiles.map((file) => (
                                    <Button
                                        key={file.id}
                                        onClick={() => handleFileClick(file.id)}
                                        variant={currentFileId === file.id ? "secondary" : "ghost"}
                                        className="group flex flex-col items-start border w-full h-auto py-2 px-2 gap-1"
                                    >
                                        <div className="flex items-center w-full gap-2">
                                            <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span className="text-sm font-medium truncate flex-1 text-left">{file.name}</span>
                                            {openingId === file.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                        </div>

                                        <div className="flex justify-between w-full text-[10px] text-muted-foreground pl-5.5">
                                            <span className="truncate max-w-[100px]">by {file.author}</span>
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
        </div>
    );
}
