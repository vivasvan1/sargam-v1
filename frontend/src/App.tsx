import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import "./App.css";

// Components
import { GoogleDriveSaveDialog } from "@/components/google-drive/GoogleDriveSaveDialog";
import { GoogleDriveLoadDialog } from "@/components/google-drive/GoogleDriveLoadDialog";
import { Header } from "./components/Header";
import { NotebookEditor } from "./components/NotebookEditor";

// Libs
import { toast, Toaster } from "sonner";
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  initializeGoogleAPI,
  authenticate,
  disconnect,
  getCurrentUser,
  isAuthenticated,
  updateFileById,
  publishToRegistry,
  loadFile,
  checkIfEditable,
  getFileMetadata,
} from "./lib/googleDrive";
import type { GoogleUser } from "./lib/googleDrive";
import { MenuBar } from "./components/MenuBar";
import { useNotebook } from "./hooks/useNotebook";
import type { Notebook } from "./types/notebook";
import { NotebookSettingsProvider } from "./context/NotebookSettingsContext";

// Notebook interfaces imported from types/notebook

// Load default notebook
const loadDefaultNotebook = async (): Promise<Notebook> => {
  try {
    const response = await fetch("/raag_khamaj_demo.imnb");
    if (response.ok) {
      const content = await response.json();
      return content;
    }
  } catch (err) {
    console.error("Failed to load default notebook", err);
  }
  // Fallback to empty notebook
  return {
    imnb_version: 1,
    metadata: { title: "New Notebook" },
    cells: [],
  };
};

// Google Client ID - should be set via environment variable or config
// For development, you can set this in a .env file as VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

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
    metadata: { title: "New Notebook" },
    cells: [],
  });

  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("raag_khamaj_demo.imnb");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    const storedTheme = localStorage.getItem("sargam-theme");
    return (storedTheme as "light" | "dark" | "system") || "light";
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Google Drive state
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [googleDriveUser, setGoogleDriveUser] = useState<GoogleUser | null>(
    null
  );
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [driveFileId, setDriveFileId] = useState<string | null>(null); // Track if notebook was saved to Drive
  const [isReadOnly, setIsReadOnly] = useState(false); // Track if current file is read-only
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null); // Track last saved content for change detection
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");

  // Initialize Google API on mount
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) {
      initializeGoogleAPI(GOOGLE_CLIENT_ID)
        .then(() => {
          // Check if already authenticated
          if (isAuthenticated()) {
            setGoogleDriveConnected(true);
            setGoogleDriveUser(getCurrentUser());
          }
        })
        .catch((error) => {
          console.error("Failed to initialize Google API:", error);
        });
    }
  }, []);

  // Load default notebook on mount
  useEffect(() => {
    // Check for fileId in URL
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get("fileId");

    if (fileId) {
      // If fileId is present, try to load it (public file)
      toast.info("Loading shared notebook...");
      loadFile(fileId)
        .then((fileContent) => {
          setNotebook(fileContent);
          const title = fileContent.metadata?.title || "Shared Notebook";
          setFilePath(`${title}.imnb`);
          setDriveFileId(fileId);
          setLastSavedContent(JSON.stringify(fileContent, null, 2));
          setSaveStatus("saved");

          // Check if file is editable
          getFileMetadata(fileId).then(metadata => {
            const editable = checkIfEditable(metadata);
            setIsReadOnly(!editable);
            if (!editable) {
              toast.info("This notebook is read-only. Save a copy to edit.");
            }
          }).catch(console.error);

          toast.success("Loaded shared notebook");
        })
        .catch((error) => {
          console.error("Failed to load shared notebook:", error);
          toast.error("Failed to load shared notebook. It might not be public.");
          // Fallback to default if loading fails
          loadDefaultNotebook().then((defaultNotebook) => {
            setNotebook(defaultNotebook);
            if (defaultNotebook.metadata?.title) {
              setFilePath("raag_khamaj_demo.imnb");
            }
          });
        });
    } else {
      // Load default notebook on mount if no fileId
      loadDefaultNotebook().then((defaultNotebook) => {
        setNotebook(defaultNotebook);
        if (defaultNotebook.metadata?.title) {
          setFilePath("raag_khamaj_demo.imnb");
        }
      });
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("sargam-theme", theme);
  }, [theme]);

  // Sync URL with driveFileId
  useEffect(() => {
    const url = new URL(window.location.href);
    if (driveFileId) {
      url.searchParams.set("fileId", driveFileId);
    } else {
      url.searchParams.delete("fileId");
    }
    window.history.replaceState({}, "", url.toString());
  }, [driveFileId]);

  // Auto-save to Google Drive
  useEffect(() => {
    // If content has changed, mark as unsaved
    if (lastSavedContent && JSON.stringify(notebook, null, 2) !== lastSavedContent) {
      setSaveStatus("unsaved");
    }

    // Only auto-save if:
    // 1. Connected to Google Drive
    // 2. Notebook was previously saved to Drive (has file ID)
    // 3. Content has changed since last save
    // 4. File is not read-only
    if (!googleDriveConnected || !driveFileId || isReadOnly) {
      return;
    }

    const currentContent = JSON.stringify(notebook, null, 2);

    // Skip if content hasn't changed
    if (currentContent === lastSavedContent) {
      setSaveStatus("saved");
      return;
    }

    // Debounce: wait 2 seconds after last change before auto-saving
    const autoSaveTimer = setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await updateFileById(driveFileId, currentContent);
        setLastSavedContent(currentContent);
        setSaveStatus("saved");
        // Silently save - don't show toast to avoid spam
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus("unsaved"); // Revert to unsaved on failure
        // Don't show error toast for auto-save failures to avoid spam
        // User can manually save if needed
      }
    }, 2000); // 2 second debounce

    return () => {
      clearTimeout(autoSaveTimer);
    };
  }, [notebook, googleDriveConnected, driveFileId, lastSavedContent, isReadOnly]);

  const handleNew = () => {
    if (window.confirm("Start a new notebook? Unsaved changes will be lost.")) {
      setNotebook({
        imnb_version: 1,
        metadata: { title: "New Notebook" },
        cells: [],
      });
      setFilePath("untitled.imnb");
      setDriveFileId(null);
      setIsReadOnly(false);
      setLastSavedContent(null);
      setActiveCellId(null);
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
        toast.success(`Loaded ${file.name}`);
      } catch (err) {
        console.error("Malformed IMNB file", err);
        toast.error("Invalid .imnb file format");
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    if (!notebook) return;
    const blob = new Blob([JSON.stringify(notebook, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filePath.endsWith(".imnb") ? filePath : `${filePath}.imnb`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Notebook downloaded");
  };

  // Google Drive handlers
  const handleGoogleDriveConnect = async () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error(
        "Google Client ID not configured. Please set VITE_GOOGLE_CLIENT_ID environment variable."
      );
      return;
    }

    try {
      await initializeGoogleAPI(GOOGLE_CLIENT_ID);
      const user = await authenticate();
      setGoogleDriveConnected(true);
      setGoogleDriveUser(user);
      toast.success(`Connected to Google Drive as ${user?.email || "Connected"}`);
    } catch (error: any) {
      console.error("Error connecting to Google Drive:", error);
      if (error.message === "Sign-in cancelled") {
        toast.info("Sign-in cancelled");
      } else {
        toast.error(error.message || "Failed to connect to Google Drive");
      }
    }
  };

  const handleGoogleDriveDisconnect = async () => {
    try {
      await disconnect();
      setGoogleDriveConnected(false);
      setGoogleDriveUser(null);
      toast.success("Disconnected from Google Drive");
    } catch (error) {
      console.error("Error disconnecting from Google Drive:", error);
      toast.error("Failed to disconnect from Google Drive");
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
      const loadingToast = toast.loading("Saving changes...");
      try {
        const content = JSON.stringify(notebook, null, 2);
        await updateFileById(driveFileId, content);
        setLastSavedContent(content);
        toast.dismiss(loadingToast);
        toast.success("Notebook saved");
      } catch (error: any) {
        console.error("Save failed:", error);
        toast.dismiss(loadingToast);
        toast.error(error.message || "Failed to save changes");
      }
    } else {
      setSaveDialogOpen(true);
    }
  };

  const handleLoadFromDrive = () => {
    if (!googleDriveConnected) {
      toast.error("Please connect to Google Drive first");
      return;
    }
    setLoadDialogOpen(true);
  };

  const handleDriveLoad = (loadedNotebook: Notebook, fileId?: string) => {
    setNotebook(loadedNotebook);
    const fileName = loadedNotebook.metadata?.title
      ? `${loadedNotebook.metadata.title}.imnb`
      : "untitled.imnb";
    setFilePath(fileName);
    if (fileId) {
      setDriveFileId(fileId);
      setLastSavedContent(JSON.stringify(loadedNotebook, null, 2));

      // Check capabilities
      getFileMetadata(fileId).then(metadata => {
        const editable = checkIfEditable(metadata);
        setIsReadOnly(!editable);
        if (!editable) {
          toast.info("This notebook is read-only. Save a copy to edit.");
        } else {
          setIsReadOnly(false);
        }
      }).catch(console.error);
    } else {
      setDriveFileId(null);
      setIsReadOnly(false);
    }
    toast.success("Notebook loaded from Google Drive");
  };

  const handlePublish = async () => {
    if (!driveFileId || !googleDriveConnected) {
      toast.error("Please save to Google Drive first");
      return;
    }

    // Optional: Ask for description? For now, simle confirm.
    const confirm = window.confirm("This will make your notebook public to the community. Proceed?");
    if (!confirm) return;

    try {
      const loadingToast = toast.loading("Publishing to community...");
      // For now, we use current user name if available, else Anonymous
      const authorName = googleDriveUser?.name || "Anonymous";
      const title = notebook.metadata?.title || "Untitled Notebook";

      await publishToRegistry(driveFileId, title, "", authorName);
      toast.dismiss(loadingToast);
      toast.success("Successfully published to community!");
    } catch (error) {
      console.error("Publishing failed:", error);
      toast.error("Failed to publish notebook");
    }
  };

  return (
    <NotebookSettingsProvider>
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

          <SidebarInset className="flex-1 flex flex-col min-w-0 bg-muted/5 overflow-hidden">
            <Header
              title={notebook.metadata?.title || ""}
              onTitleUpdate={updateTitle}
              filePath={filePath}
              googleDriveConnected={googleDriveConnected}
              onSaveToDrive={handleSaveToDrive}
              onDownload={handleDownload}
              currentFileId={driveFileId}
              saveStatus={saveStatus}
            />

            <div className="border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm gap-0.5">
              <MenuBar
                onNew={handleNew}
                onOpen={() => fileInputRef.current?.click()}
                onSaveDrive={handleSaveToDrive}
                onLoadDrive={handleLoadFromDrive}
                onPublish={handlePublish}
                onDownload={handleDownload}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                onAddMusic={() => addCell("music", -1)}
                onAddMarkdown={() => addCell("markdown", -1)}
                theme={theme}
                setTheme={setTheme}
                googleBacked={!!driveFileId}
                currentFileId={driveFileId}
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
              }
            }}
          />

          <GoogleDriveLoadDialog
            open={loadDialogOpen}
            onOpenChange={setLoadDialogOpen}
            onLoad={handleDriveLoad}
          />

          <Toaster position="bottom-right" theme={theme} closeButton />
          <input
            type="file"
            accept=".imnb,.json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </div>
      </SidebarProvider>
    </NotebookSettingsProvider >
  );
}

export default App;
