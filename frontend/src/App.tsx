import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import './App.css';

// Components
import { GoogleDriveSaveDialog } from '@/components/google-drive/GoogleDriveSaveDialog';
import { GoogleDriveLoadDialog } from '@/components/google-drive/GoogleDriveLoadDialog';
import { Header } from './components/Header';
import { NotebookEditor } from './components/NotebookEditor';

// Libs
import { toast, Toaster } from 'sonner';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  initializeGoogleAPI,
  authenticate,
  disconnect,
  updateFileById,
  publishToRegistry,
  unpublishFromRegistry,
  loadNotebookAndMetadata,
} from './lib/googleDrive';
// GoogleUser type no longer needed here as it is in store
import { MenuBar } from './components/MenuBar';
import { useNotebook } from './hooks/useNotebook';
import type { Notebook } from './types/notebook';
import { useNotebookSettings } from './context/NotebookSettingsContext';
import { useNotebookStore } from './store/useNotebookStore';
import { useAuthStore } from './store/useAuthStore';
import { usePlaybackStore } from './store/usePlaybackStore';
import { Analytics } from '@vercel/analytics/react';
import { Cloud, Loader2 } from 'lucide-react';

// Notebook interfaces imported from types/notebook

// Load default notebook
const loadDefaultNotebook = async (): Promise<Notebook> => {
  try {
    const response = await fetch(
      '/Raag Brindavani Sarang Composition - Saptak Music School - Ahmedabad.imnb'
    );
    if (response.ok) {
      const content = await response.json();
      return content;
    }
  } catch (err) {
    console.error('Failed to load default notebook', err);
  }
  // Fallback to empty notebook
  return {
    imnb_version: 1,
    metadata: { title: 'New Notebook' },
    cells: [],
  };
};

// Google Client ID - should be set via environment variable or config
// For development, you can set this in a .env file as VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

interface AuthGateProps {
  isInitializing: boolean;
  isSigningIn: boolean;
  errorMessage: string | null;
  onSignIn: () => void;
}

function AuthGate({
  isInitializing,
  isSigningIn,
  errorMessage,
  onSignIn,
}: AuthGateProps) {
  const isBusy = isInitializing || isSigningIn;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_40%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.35))] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-5xl">
          <div className="grid overflow-hidden rounded-3xl border border-border/60 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-border/60 bg-[linear-gradient(180deg,_rgba(255,255,255,0.22),_transparent)] p-4 md:border-b-0 md:border-r md:p-6">
              <div className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/70 shadow-xl">
                <img
                  src="/screenshot.png"
                  alt="Speede Sargam notebook preview"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            <div className="flex flex-col justify-center gap-6 p-8 md:p-12">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Speede - Sargam Notebooks
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  <strong className="font-semibold text-foreground">
                    Sargam notebook
                  </strong>
                  uses your Google Drive to load notebooks, save changes, and
                  open shared files.
                </p>
              </div>

              <Button
                onClick={onSignIn}
                disabled={isBusy || !!errorMessage}
                size="lg"
                className="h-12 justify-center gap-2 rounded-xl text-sm font-medium"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                {isInitializing
                  ? 'Initializing Google...'
                  : isSigningIn
                    ? 'Waiting for Google...'
                    : 'Sign in with Google'}
              </Button>

              {errorMessage ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  The first sign-in requests Google Drive access up front so the
                  editor is ready immediately after authentication.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 px-4 pt-4 text-xs text-muted-foreground">
            <a
              href="https://experts.speede.site/licenses/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Terms & Conditions
            </a>
            <span className="text-border">•</span>
            <a
              href="https://experts.speede.site/licenses/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const {
    notebook,
    setNotebook,
    updateCell,
    addCell,
    deleteCell,
    undo,
    redo,
    updateTitle,
    canUndo,
    canRedo,
  } = useNotebook({
    imnb_version: 1,
    metadata: { title: 'New Notebook' },
    cells: [],
  });

  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState('raag_khamaj_demo.imnb');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const storedTheme = localStorage.getItem('sargam-theme');
    return (storedTheme as 'light' | 'dark' | 'system') || 'light';
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Google Drive state
  // Google Drive state (moved to global store)
  const { isAuthenticated: googleDriveConnected, user: googleDriveUser } =
    useAuthStore();
  // isInitialized is accessed directly in the effects via useAuthStore hook or check if needed
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [driveFileId, setDriveFileId] = useState<string | null>(null); // Track if notebook was saved to Drive
  const [isReadOnly, setIsReadOnly] = useState(false); // Track if current file is read-only
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null); // Track last saved content for change detection
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>(
    'saved'
  );
  const [isPublished, setIsPublished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authInitError, setAuthInitError] = useState<string | null>(null);
  const [hasLoadedInitialNotebook, setHasLoadedInitialNotebook] =
    useState(false);

  // Initialize Google API on mount
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setAuthInitError(
        'Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID before starting the frontend.'
      );
      return;
    }

    initializeGoogleAPI(GOOGLE_CLIENT_ID)
      .then(() => {
        setAuthInitError(null);
      })
      .catch((error) => {
        console.error('Failed to initialize Google API:', error);
        setAuthInitError(
          error.message || 'Failed to initialize Google authentication.'
        );
      });
  }, []);

  // Load content only after Google authentication is established.
  useEffect(() => {
    if (!isInitialized || !googleDriveConnected || hasLoadedInitialNotebook) {
      return;
    }

    let isCancelled = false;

    const applyLoadedNotebook = (
      nextNotebook: Notebook,
      fileId: string | null,
      readOnly: boolean,
      published: boolean
    ) => {
      setNotebook(nextNotebook);
      useNotebookStore
        .getState()
        .setNotebook(
          nextNotebook,
          fileId,
          nextNotebook.metadata || null,
          readOnly,
          published
        );

      const title = nextNotebook.metadata?.title || 'Untitled Notebook';
      setFilePath(fileId ? `${title}.imnb` : 'raag_khamaj_demo.imnb');
      setDriveFileId(fileId);
      setLastSavedContent(
        fileId ? JSON.stringify(nextNotebook, null, 2) : null
      );
      setSaveStatus('saved');
      setIsReadOnly(readOnly);
      setIsPublished(published);
      setActiveCellId(null);
    };

    const bootstrapNotebook = async () => {
      setIsLoading(true);

      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('fileId');

      try {
        if (fileId) {
          toast.info('Loading shared notebook...');
          const { notebook, isReadOnly, isPublished } =
            await loadNotebookAndMetadata(fileId);

          if (isCancelled) return;

          applyLoadedNotebook(notebook, fileId, isReadOnly, isPublished);

          if (isReadOnly) {
            toast.info('Notebook loaded in read-only mode.');
          }
          toast.success('Loaded shared notebook');
          return;
        }

        const defaultNotebook = await loadDefaultNotebook();
        if (isCancelled) return;

        applyLoadedNotebook(defaultNotebook, null, false, false);
      } catch (error) {
        console.error('Failed to load initial notebook:', error);
        toast.error('Failed to load notebook. Opening the default notebook.');

        const defaultNotebook = await loadDefaultNotebook();
        if (isCancelled) return;

        applyLoadedNotebook(defaultNotebook, null, false, false);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setHasLoadedInitialNotebook(true);
        }
      }
    };

    bootstrapNotebook();

    return () => {
      isCancelled = true;
    };
  }, [
    googleDriveConnected,
    hasLoadedInitialNotebook,
    isInitialized,
    setNotebook,
  ]);

  useEffect(() => {
    if (!googleDriveConnected) {
      setHasLoadedInitialNotebook(false);
      setIsLoading(false);
      useNotebookStore.getState().reset();
    }
  }, [googleDriveConnected]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sargam-theme', theme);
  }, [theme]);

  // Sync URL with driveFileId
  useEffect(() => {
    if (!hasLoadedInitialNotebook) return;

    const url = new URL(window.location.href);
    if (driveFileId) {
      url.searchParams.set('fileId', driveFileId);
    } else {
      url.searchParams.delete('fileId');
    }
    window.history.replaceState({}, '', url.toString());
  }, [driveFileId, hasLoadedInitialNotebook]);

  // Auto-save to Google Drive
  const { autoSaveEnabled } = useNotebookSettings();

  useEffect(() => {
    // If content has changed, mark as unsaved
    if (
      lastSavedContent &&
      JSON.stringify(notebook, null, 2) !== lastSavedContent
    ) {
      setSaveStatus('unsaved');
    }

    // Only auto-save if:
    // 1. Connected to Google Drive
    // 2. Notebook was previously saved to Drive (has file ID)
    // 3. Content has changed since last save
    // 4. File is not read-only
    // 5. Auto-save is enabled by user
    if (
      !googleDriveConnected ||
      !driveFileId ||
      isReadOnly ||
      !autoSaveEnabled
    ) {
      return;
    }

    const currentContent = JSON.stringify(notebook, null, 2);

    // Skip if content hasn't changed
    if (currentContent === lastSavedContent) {
      setSaveStatus('saved');
      return;
    }

    // Debounce: wait 2 seconds after last change before auto-saving
    const autoSaveTimer = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await updateFileById(driveFileId, currentContent);
        setLastSavedContent(currentContent);
        setSaveStatus('saved');
        // Silently save - don't show toast to avoid spam
      } catch (error: any) {
        console.error('Auto-save failed:', error);
        setSaveStatus('unsaved'); // Revert to unsaved on failure
        // Don't show error toast for auto-save failures to avoid spam
        // User can manually save if needed
        if (error.message?.includes('session expired')) {
          toast.error('Drive session expired.', {
            action: {
              label: 'Reconnect',
              onClick: () => handleGoogleDriveConnect(),
            },
            duration: 10000,
          });
        }
      }
    }, 2000); // 2 second debounce

    return () => {
      clearTimeout(autoSaveTimer);
    };
  }, [
    notebook,
    googleDriveConnected,
    driveFileId,
    lastSavedContent,
    isReadOnly,
    autoSaveEnabled,
  ]);

  const handleNew = () => {
    if (window.confirm('Start a new notebook? Unsaved changes will be lost.')) {
      setNotebook({
        imnb_version: 1,
        metadata: { title: 'New Notebook' },
        cells: [],
      });
      setFilePath('untitled.imnb');
      setDriveFileId(null);
      setIsReadOnly(false);
      setLastSavedContent(null);
      setActiveCellId(null);
      setIsPublished(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        setNotebook(content);
        setFilePath(file.name);
        setDriveFileId(null); // Clear Drive file ID for local file
        setIsReadOnly(false);
        setLastSavedContent(null);
        setIsPublished(false);
        toast.success(`Loaded ${file.name}`);
      } catch (err) {
        console.error('Malformed IMNB file', err);
        toast.error('Invalid .imnb file format');
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!notebook) return;
    const blob = new Blob([JSON.stringify(notebook, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filePath.endsWith('.imnb') ? filePath : `${filePath}.imnb`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Notebook downloaded');
  };

  // Google Drive handlers
  const handleGoogleDriveConnect = async () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error(
        'Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable.'
      );
      return;
    }

    if (!isInitialized) {
      toast.error(
        'Google Drive is still initializing. Please wait a moment and try again.'
      );
      return;
    }

    try {
      setIsAuthenticating(true);
      const user = await authenticate();
      // Store updates automatically via googleDrive.ts
      toast.success(
        `Connected to Google Drive as ${user?.email || 'Connected'}`
      );
    } catch (error: any) {
      console.error('Error connecting to Google Drive:', error);
      if (error.message === 'Sign-in cancelled') {
        toast.info('Sign-in cancelled');
      } else {
        toast.error(error.message || 'Failed to connect to Google Drive');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleDriveDisconnect = async () => {
    try {
      await disconnect();
      setHasLoadedInitialNotebook(false);
      setDriveFileId(null);
      setLastSavedContent(null);
      setIsPublished(false);
      setIsReadOnly(false);
      useNotebookStore.getState().reset();
      // Store updates automatically via googleDrive.ts
      toast.success('Disconnected from Google Drive');
    } catch (error) {
      console.error('Error disconnecting from Google Drive:', error);
      toast.error('Failed to disconnect from Google Drive');
    }
  };

  const handleSaveToDrive = async () => {
    if (!googleDriveConnected) {
      handleGoogleDriveConnect();
      return;
    }

    // Smart Save:
    // If we have a driveFileId AND it is writeable (not read-only), overwrite it directly.
    // Otherwise (new file or read-only), open the save dialog (Save As).
    if (driveFileId && !isReadOnly) {
      const loadingToast = toast.loading('Saving changes...');
      try {
        const content = JSON.stringify(notebook, null, 2);
        await updateFileById(driveFileId, content);
        setLastSavedContent(content);
        toast.dismiss(loadingToast);
        toast.success('Notebook saved');
      } catch (error: any) {
        console.error('Save failed:', error);
        toast.dismiss(loadingToast);
        if (error.message?.includes('session expired')) {
          toast.error('Session expired.', {
            action: {
              label: 'Reconnect',
              onClick: () => handleGoogleDriveConnect(),
            },
            duration: 10000,
          });
        } else {
          toast.error(error.message || 'Failed to save changes');
        }
      }
    } else {
      setSaveDialogOpen(true);
    }
  };

  const handleLoadFromDrive = () => {
    if (!googleDriveConnected) {
      toast.error('Please connect to Google Drive first');
      return;
    }
    setLoadDialogOpen(true);
  };

  const handleCreateCopy = () => {
    if (!googleDriveConnected) {
      handleGoogleDriveConnect();
      return;
    }

    // Prepend "Copy of " to the title
    const currentTitle = notebook.metadata?.title || 'Untitled Notebook';
    const newTitle = `Copy of ${currentTitle}`;
    updateTitle(newTitle);

    setDriveFileId(null);
    setIsReadOnly(false);
    setSaveDialogOpen(true);
    toast.info('Saving a copy to your Drive...');
  };

  /*
   * Refactored to accept full metadata.
   * Signature matches what GoogleDriveBrowser will pass.
   */
  const handleDriveLoad = (
    loadedNotebook: Notebook,
    fileId?: string,
    readOnlyStatus?: boolean,
    publishedStatus?: boolean
  ) => {
    setNotebook(loadedNotebook);

    // Update global store
    useNotebookStore
      .getState()
      .setNotebook(
        loadedNotebook,
        fileId || null,
        loadedNotebook.metadata || null,
        readOnlyStatus || false,
        publishedStatus || false
      );

    const fileName = loadedNotebook.metadata?.title
      ? `${loadedNotebook.metadata.title}.imnb`
      : 'untitled.imnb';
    setFilePath(fileName);

    if (fileId) {
      setDriveFileId(fileId);
      setLastSavedContent(JSON.stringify(loadedNotebook, null, 2));

      // Use the statuses passed from loadNotebookAndMetadata
      if (typeof readOnlyStatus === 'boolean') {
        setIsReadOnly(readOnlyStatus);
        if (readOnlyStatus && useAuthStore.getState().isAuthenticated) {
          toast.info('This notebook is read-only. Save a copy to edit.');
        }
      } else {
        // Fallback behavior if not passed (though it should be now)
        setIsReadOnly(false);
      }

      if (typeof publishedStatus === 'boolean') {
        setIsPublished(publishedStatus);
      } else {
        setIsPublished(false);
      }
    } else {
      setDriveFileId(null);
      setIsReadOnly(false);
      setIsPublished(false);
    }
    toast.success('Notebook loaded from Google Drive');
  };

  const handlePublish = async () => {
    if (!driveFileId || !googleDriveConnected) {
      toast.error('Please save to Google Drive first');
      return;
    }

    // Optional: Ask for description? For now, simle confirm.
    const confirm = window.confirm(
      'This will make your notebook public to the community. Proceed?'
    );
    if (!confirm) return;

    try {
      const loadingToast = toast.loading('Publishing to community...');
      // For now, we use current user name if available, else Anonymous
      const authorName = googleDriveUser?.name || 'Anonymous';
      const title = notebook.metadata?.title || 'Untitled Notebook';

      await publishToRegistry(driveFileId, title, '', authorName);
      setIsPublished(true);
      toast.dismiss(loadingToast);
      toast.success('Successfully published to community!');
    } catch (error) {
      console.error('Publishing failed:', error);
      toast.error('Failed to publish notebook');
    }
  };

  const handleUnpublish = async () => {
    if (!driveFileId || !googleDriveConnected) return;

    const confirm = window.confirm(
      'Remove this notebook from the community registry?'
    );
    if (!confirm) return;

    try {
      const loadingToast = toast.loading('Unpublishing...');
      await unpublishFromRegistry(driveFileId);
      setIsPublished(false);
      toast.dismiss(loadingToast);
      toast.success('Removed from community');
    } catch (error) {
      console.error('Unpublishing failed:', error);
      toast.error('Failed to remove from community');
    }
  };

  const { cellControllers } = usePlaybackStore();

  const handlePlayCell = () => {
    if (activeCellId && cellControllers[activeCellId]) {
      cellControllers[activeCellId]();
    } else {
      toast.error('No active music cell selected.');
    }
  };

  const handlePlayAll = async () => {
    const musicCells = notebook.cells.filter((c) => c.cell_type === 'music');
    if (musicCells.length === 0) {
      toast.info('No music cells to play.');
      return;
    }

    for (const cell of musicCells) {
      setActiveCellId(cell.id);

      const playFn = usePlaybackStore.getState().cellControllers[cell.id];
      if (playFn) {
        const isNatural = await playFn();
        if (!isNatural) {
          break; // Stop sequential playback if user manually stopped it
        }
      }
    }
  };

  const showAuthGate = !googleDriveConnected;

  return (
    <>
      {showAuthGate ? (
        <AuthGate
          isInitializing={!authInitError && !isInitialized}
          isSigningIn={isAuthenticating}
          errorMessage={authInitError}
          onSignIn={handleGoogleDriveConnect}
        />
      ) : (
        <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/10">
            <Sidebar
              onFileUpload={handleFileUpload}
              onNew={handleNew}
              theme={theme}
              setTheme={setTheme}
              isOpen={sidebarOpen}
              googleDriveConnected={googleDriveConnected}
              googleDriveUser={googleDriveUser}
              onGoogleDriveConnect={handleGoogleDriveConnect}
              onGoogleDriveDisconnect={handleGoogleDriveDisconnect}
              onLoadFromDrive={handleLoadFromDrive}
              onLoadDriveFile={handleDriveLoad}
              currentFileId={driveFileId}
            />

            {isLoading ? (
              <SidebarInset className="flex-1 flex flex-col items-center justify-center bg-muted/5">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="text-muted-foreground animate-pulse">
                    Loading notebook...
                  </p>
                </div>
              </SidebarInset>
            ) : (
              <SidebarInset className="flex-1 flex flex-col min-w-0 bg-muted/5 overflow-hidden">
                <Header
                  title={notebook.metadata?.title || ''}
                  onTitleUpdate={updateTitle}
                  filePath={filePath}
                  googleDriveConnected={googleDriveConnected}
                  onSaveToDrive={handleSaveToDrive}
                  onDownload={handleDownload}
                  currentFileId={driveFileId}
                  saveStatus={saveStatus}
                  isReadOnly={isReadOnly}
                  onCreateCopy={handleCreateCopy}
                />

                <div className="border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm gap-0.5">
                  <MenuBar
                    onNew={handleNew}
                    onOpen={() => fileInputRef.current?.click()}
                    onSaveDrive={handleSaveToDrive}
                    onLoadDrive={handleLoadFromDrive}
                    onPublish={handlePublish}
                    onUnpublish={handleUnpublish}
                    isPublished={isPublished}
                    isReadOnly={isReadOnly}
                    onDownload={handleDownload}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={undo}
                    onRedo={redo}
                    onAddMusic={() => addCell('music', -1)}
                    onAddMarkdown={() => addCell('markdown', -1)}
                    theme={theme}
                    setTheme={setTheme}
                    googleDriveConnected={googleDriveConnected}
                    currentFileId={driveFileId}
                    onPlayCell={handlePlayCell}
                    onPlayAll={handlePlayAll}
                  />
                </div>

                <NotebookEditor
                  notebook={notebook}
                  activeCellId={activeCellId}
                  setActiveCellId={setActiveCellId}
                  updateCell={updateCell}
                  deleteCell={deleteCell}
                  addCell={addCell}
                  theme={theme}
                />
              </SidebarInset>
            )}

            <GoogleDriveSaveDialog
              open={saveDialogOpen}
              onOpenChange={setSaveDialogOpen}
              notebook={notebook}
              onSave={(fileId: string | null) => {
                // Track that this notebook is saved to Drive
                if (fileId) {
                  setDriveFileId(fileId);
                  setIsReadOnly(false); // Just saved, so we own it
                  setLastSavedContent(JSON.stringify(notebook, null, 2));

                  // Update filePath to reflect the new saved name
                  const title = notebook.metadata?.title || 'Untitled Notebook';
                  setFilePath(`${title}.imnb`);

                  // Update global store (new file is not published)
                  useNotebookStore
                    .getState()
                    .setNotebook(
                      notebook,
                      fileId,
                      notebook.metadata || null,
                      false,
                      false
                    );
                  setIsPublished(false); // Ensure local state is also reset if needed
                }
              }}
            />

            <GoogleDriveLoadDialog
              open={loadDialogOpen}
              onOpenChange={setLoadDialogOpen}
              onLoad={handleDriveLoad}
            />

            <input
              type="file"
              accept=".imnb,.json"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>
        </SidebarProvider>
      )}
      <Toaster position="bottom-right" theme={theme} closeButton />
      <Analytics />
    </>
  );
}

export default App;
