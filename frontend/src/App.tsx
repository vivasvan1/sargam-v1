import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import './App.css';

// Components
import { GoogleDriveSaveDialog } from '@/components/google-drive/GoogleDriveSaveDialog';
import { GoogleDriveLoadDialog } from '@/components/google-drive/GoogleDriveLoadDialog';
import { Header } from './components/Header';
import { NotebookEditor } from './components/NotebookEditor';
import { PrintNotebook } from './components/PrintNotebook';

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
  loadRegistryNotebook,
  adoptStoredGoogleToken,
  clearGoogleAuthCache,
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
  const isBusy = isSigningIn || isInitializing;

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
                    Sargam notebook{' '}
                  </strong>
                  uses your Google Drive to load notebooks, save changes, and
                  open shared files.
                </p>
              </div>

              <Button
                onClick={onSignIn}
                disabled={isBusy}
                size="lg"
                variant="outline"
                className="h-12 justify-center gap-3 rounded-xl text-sm font-medium bg-white text-black hover:bg-gray-50 border-gray-200 shadow-sm transition-all"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.964 10.705a5.41 5.41 0 0 1-.282-1.705c0-.6.105-1.182.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.295C4.672 5.168 6.656 3.58 9 3.58z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                <span className="font-medium text-primary">
                  {isSigningIn
                    ? 'Waiting for Google...'
                    : isInitializing
                      ? 'Preparing Google sign-in...'
                      : 'Sign in with Google'}
                </span>
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
  const [publishedOwnerEmail, setPublishedOwnerEmail] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authInitError, setAuthInitError] = useState<string | null>(null);
  const [hasLoadedInitialNotebook, setHasLoadedInitialNotebook] =
    useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(25);
  const savingContentRef = React.useRef<string | null>(null);

  // Keep the browser document title equal to the notebook title. Browsers use
  // this value as the suggested filename for both menu and keyboard printing.
  useEffect(() => {
    document.title = (
      notebook.metadata?.title?.trim() || 'Sargam Notebook'
    ).replace(/\.(imnb|pdf)$/i, '');
  }, [notebook.metadata?.title]);

  // Initialize Google API on mount
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setAuthInitError(
        'Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID before starting the frontend.'
      );
      return;
    }

    Promise.race([
      initializeGoogleAPI(GOOGLE_CLIENT_ID),
      new Promise((_, reject) =>
        window.setTimeout(() => {
          reject(new Error('Google authentication initialization timed out.'));
        }, 20000)
      ),
    ])
      .then(() => {
        setAuthInitError(null);
      })
      .catch((error) => {
        console.error('Failed to initialize Google API:', error);
        if (
          error.message === 'Google authentication initialization timed out.'
        ) {
          clearGoogleAuthCache();
        }
        setAuthInitError(
          error.message || 'Failed to initialize Google authentication.'
        );
      });
  }, []);

  useEffect(() => {
    const handleStorage = async (event: StorageEvent) => {
      if (event.key !== 'google_drive_token' || !event.newValue) return;
      const adopted = await adoptStoredGoogleToken();
      if (adopted) {
        toast.success('Connected to Google Drive');
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Load public/shared content without requiring Google sign-in.
  useEffect(() => {
    if (hasLoadedInitialNotebook) {
      return;
    }

    let isCancelled = false;

    const applyLoadedNotebook = (
      nextNotebook: Notebook,
      fileId: string | null,
      readOnly: boolean,
      published: boolean,
      ownerEmail: string | null = null
    ) => {
      const isOwner =
        !!ownerEmail &&
        !!googleDriveUser?.email &&
        ownerEmail.toLowerCase() === googleDriveUser.email.toLowerCase();
      const effectiveReadOnly = published && isOwner ? false : readOnly;

      setNotebook(nextNotebook);
      useNotebookStore
        .getState()
        .setNotebook(
          nextNotebook,
          fileId,
          nextNotebook.metadata || null,
          effectiveReadOnly,
          published
        );

      const title = nextNotebook.metadata?.title || 'Untitled Notebook';
      setFilePath(fileId ? `${title}.imnb` : 'raag_khamaj_demo.imnb');
      setDriveFileId(fileId);
      setLastSavedContent(
        fileId ? JSON.stringify(nextNotebook, null, 2) : null
      );
      setSaveStatus('saved');
      setIsReadOnly(effectiveReadOnly);
      setIsPublished(published);
      setPublishedOwnerEmail(ownerEmail);
      setActiveCellId(null);
    };

    const bootstrapNotebook = async () => {
      setIsLoading(true);

      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('fileId');

      try {
        if (fileId) {
          toast.info('Loading community notebook...');
          const { notebook, entry } = await loadRegistryNotebook(fileId);

          if (isCancelled) return;

          applyLoadedNotebook(
            notebook,
            fileId,
            true,
            true,
            entry.ownerEmail || null
          );

          if (
            !googleDriveUser?.email ||
            entry.ownerEmail !== googleDriveUser.email
          ) {
            toast.info('Notebook loaded in read-only mode.');
          }
          toast.success('Loaded community notebook');
          return;
        }
      } catch (error) {
        console.error('Failed to load initial notebook:', error);
        toast.error(
          'This notebook is not published or is no longer available.'
        );

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
  }, [googleDriveUser?.email, hasLoadedInitialNotebook, setNotebook]);

  useEffect(() => {
    if (!googleDriveConnected) {
      setIsLoading(false);
    }
  }, [googleDriveConnected]);

  useEffect(() => {
    if (!isPublished || !publishedOwnerEmail) return;

    if (!googleDriveUser?.email) {
      if (!isReadOnly) {
        setIsReadOnly(true);
        useNotebookStore.getState().setReadOnly(true);
      }
      return;
    }

    const isOwner =
      publishedOwnerEmail.toLowerCase() === googleDriveUser.email.toLowerCase();
    if (isOwner && isReadOnly) {
      setIsReadOnly(false);
      useNotebookStore.getState().setReadOnly(false);
    } else if (!isOwner && !isReadOnly) {
      setIsReadOnly(true);
      useNotebookStore.getState().setReadOnly(true);
    }
  }, [googleDriveUser?.email, isPublished, isReadOnly, publishedOwnerEmail]);

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

  const syncPublishedRegistry = async (
    fileId: string,
    currentNotebook: Notebook
  ) => {
    if (!isPublished || isReadOnly || !googleDriveUser?.email) return;

    const authorName = googleDriveUser.name || 'Anonymous';
    const title = currentNotebook.metadata?.title || 'Untitled Notebook';
    await publishToRegistry(
      fileId,
      title,
      '',
      authorName,
      currentNotebook,
      googleDriveUser.email
    );
    setPublishedOwnerEmail(googleDriveUser.email);
  };

  useEffect(() => {
    const currentContent = JSON.stringify(notebook, null, 2);

    if (savingContentRef.current === currentContent) {
      setSaveStatus('saving');
      return;
    }

    // If content has changed, mark as unsaved
    if (lastSavedContent && currentContent !== lastSavedContent) {
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

    // Skip if content hasn't changed
    if (currentContent === lastSavedContent) {
      setSaveStatus('saved');
      return;
    }

    // Debounce: wait 2 seconds after last change before auto-saving
    const autoSaveTimer = setTimeout(async () => {
      try {
        savingContentRef.current = currentContent;
        setSaveStatus('saving');
        await updateFileById(driveFileId, currentContent);
        try {
          await syncPublishedRegistry(driveFileId, notebook);
        } catch (error) {
          console.error('Auto-publish sync failed:', error);
          toast.error('Saved to Drive, but community copy did not update.');
        }
        savingContentRef.current = null;
        setLastSavedContent(currentContent);
        setSaveStatus('saved');
        // Silently save - don't show toast to avoid spam
      } catch (error: any) {
        console.error('Auto-save failed:', error);
        savingContentRef.current = null;
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
    isPublished,
    googleDriveUser?.email,
    googleDriveUser?.name,
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
      setPublishedOwnerEmail(null);
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
        setPublishedOwnerEmail(null);
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

  const handlePrint = () => {
    // Radix menus render in a portal. Wait for the selected menu to close
    // before the browser captures the page for printing.
    window.setTimeout(() => {
      const notebookTitle = (
        notebook.metadata?.title?.trim() || 'Sargam Notebook'
      ).replace(/\.(imnb|pdf)$/i, '');

      document.title = notebookTitle;
      // Give the browser a frame to commit the title before creating the
      // print-preview document and its default PDF filename.
      window.requestAnimationFrame(() => window.print());
    }, 0);
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
      toast.info(
        'Google sign-in is still loading. Please try again in a moment.'
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
      } else if (error.message?.toLowerCase().includes('popup')) {
        toast.error(
          'Google sign-in popup was blocked. Please allow popups and try again.'
        );
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
      if (driveFileId) {
        setIsReadOnly(true);
        useNotebookStore.getState().setReadOnly(true);
      }
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
        savingContentRef.current = content;
        setSaveStatus('saving');
        await updateFileById(driveFileId, content);
        try {
          await syncPublishedRegistry(driveFileId, notebook);
        } catch (error) {
          console.error('Publish sync failed:', error);
          toast.error('Saved to Drive, but community copy did not update.');
        }
        savingContentRef.current = null;
        setLastSavedContent(content);
        setSaveStatus('saved');
        toast.dismiss(loadingToast);
        toast.success('Notebook saved');
      } catch (error: any) {
        console.error('Save failed:', error);
        savingContentRef.current = null;
        setSaveStatus('unsaved');
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
    setIsPublished(false);
    setPublishedOwnerEmail(null);
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
    publishedStatus?: boolean,
    ownerEmail?: string
  ) => {
    const isOwner =
      !!ownerEmail &&
      !!googleDriveUser?.email &&
      ownerEmail.toLowerCase() === googleDriveUser.email.toLowerCase();
    const effectiveReadOnly =
      publishedStatus && isOwner ? false : readOnlyStatus || false;

    setNotebook(loadedNotebook);

    // Update global store
    useNotebookStore
      .getState()
      .setNotebook(
        loadedNotebook,
        fileId || null,
        loadedNotebook.metadata || null,
        effectiveReadOnly,
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
        setIsReadOnly(effectiveReadOnly);
        if (effectiveReadOnly && useAuthStore.getState().isAuthenticated) {
          toast.info('This notebook is read-only. Save a copy to edit.');
        }
      } else {
        // Fallback behavior if not passed (though it should be now)
        setIsReadOnly(false);
      }

      if (typeof publishedStatus === 'boolean') {
        setIsPublished(publishedStatus);
        setPublishedOwnerEmail(ownerEmail || null);
      } else {
        setIsPublished(false);
        setPublishedOwnerEmail(null);
      }
    } else {
      setDriveFileId(null);
      setIsReadOnly(false);
      setIsPublished(false);
      setPublishedOwnerEmail(null);
    }
    toast.success(
      publishedStatus
        ? 'Community notebook loaded'
        : 'Notebook loaded from Google Drive'
    );
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

      await publishToRegistry(
        driveFileId,
        title,
        '',
        authorName,
        notebook,
        googleDriveUser?.email || ''
      );
      setIsPublished(true);
      setPublishedOwnerEmail(googleDriveUser?.email || null);
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
      setPublishedOwnerEmail(null);
      toast.dismiss(loadingToast);
      toast.success('Removed from community');
    } catch (error) {
      console.error('Unpublishing failed:', error);
      toast.error('Failed to remove from community');
    }
  };

  const { cellControllers, isPlayingAll, startPlayAll, stopPlayAll, setAllMusicCellIds } = usePlaybackStore();

  useEffect(() => {
    const musicCellIds = notebook.cells
      .filter((c) => c.cell_type === 'music')
      .map((c) => c.id);
    setAllMusicCellIds(musicCellIds);
  }, [notebook.cells, setAllMusicCellIds]);

  const handlePlayCell = () => {
    if (activeCellId && cellControllers[activeCellId]) {
      if (isPlayingAll) {
        stopPlayAll();
      }
      cellControllers[activeCellId]();
    } else {
      toast.error('No active music cell selected.');
    }
  };

  const handlePlayAll = () => {
    const musicCellIds = notebook.cells
      .filter((c) => c.cell_type === 'music')
      .map((c) => c.id);

    if (musicCellIds.length === 0) {
      toast.info('No music cells to play.');
      return;
    }

    if (isPlayingAll) {
      stopPlayAll();
      return;
    }

    startPlayAll(musicCellIds);
  };

  const toggleAutoScroll = React.useCallback(() => {
    setIsAutoScrolling((current) => !current);
  }, []);

  const showAuthGate = false;

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
          <div className="app-shell flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/10">
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
                  onPrint={handlePrint}
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
                    onPrint={handlePrint}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={undo}
                    onRedo={redo}
                    onAddMusic={() => addCell('music', -1)}
                    onAddMarkdown={() => addCell('markdown', -1)}
                    theme={theme}
                    setTheme={setTheme}
                    isAutoScrolling={isAutoScrolling}
                    autoScrollSpeed={autoScrollSpeed}
                    setAutoScrollSpeed={setAutoScrollSpeed}
                    onToggleAutoScroll={toggleAutoScroll}
                    googleDriveConnected={googleDriveConnected}
                    currentFileId={driveFileId}
                    onPlayCell={handlePlayCell}
                    onPlayAll={handlePlayAll}
                    isPlayingAll={isPlayingAll}
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
                  isReadOnly={isReadOnly}
                  isAutoScrolling={isAutoScrolling}
                  autoScrollSpeed={autoScrollSpeed}
                  setIsAutoScrolling={setIsAutoScrolling}
                  toggleAutoScroll={toggleAutoScroll}
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
                  setPublishedOwnerEmail(null);
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
          <PrintNotebook notebook={notebook} />
        </SidebarProvider>
      )}
      <Toaster position="bottom-right" theme={theme} closeButton />
      <Analytics />
    </>
  );
}

export default App;
