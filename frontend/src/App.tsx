import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import "./App.css";

// Components
import { Cell } from "./components/Cell";
import { AddCellControls } from "./components/AddCellControls";
import { GoogleDriveSaveDialog } from "./components/GoogleDriveSaveDialog";
import { GoogleDriveLoadDialog } from "./components/GoogleDriveLoadDialog";

// Libs
import { toast, Toaster } from "sonner";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Save,
  Plus,
  FileMusic,
  Pencil,
  Music2,
  Layout,
  MoreHorizontal,
  Download,
  Menu,
  X,
  Cloud,
} from "lucide-react";
import {
  initializeGoogleAPI,
  authenticate,
  disconnect,
  getCurrentUser,
  isAuthenticated,
  updateFileById,
} from "./lib/googleDrive";
import type { GoogleUser } from "./lib/googleDrive";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

interface NotebookCell {
  cell_type: string;
  source: string[] | string;
  metadata?: {
    language?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface Notebook {
  imnb_version: number;
  metadata: {
    title?: string;
    [key: string]: any;
  };
  cells: NotebookCell[];
}

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
  const [notebook, setNotebook] = useState<Notebook>({
    imnb_version: 1,
    metadata: { title: "New Notebook" },
    cells: [],
  });
  const [filePath, setFilePath] = useState("raag_khamaj_demo.imnb");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    const storedTheme = localStorage.getItem("sargam-theme");
    return storedTheme as "light" | "dark" | "system" || "light";
  });

  // Google Drive state
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [googleDriveUser, setGoogleDriveUser] = useState<GoogleUser | null>(
    null
  );
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [driveFileId, setDriveFileId] = useState<string | null>(null); // Track if notebook was saved to Drive
  const [lastSavedContent, setLastSavedContent] = useState<string | null>(null); // Track last saved content for change detection

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
    loadDefaultNotebook().then((defaultNotebook) => {
      setNotebook(defaultNotebook);
      if (defaultNotebook.metadata?.title) {
        setFilePath("raag_khamaj_demo.imnb");
      }
    });
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

  // Auto-save to Google Drive
  useEffect(() => {
    // Only auto-save if:
    // 1. Connected to Google Drive
    // 2. Notebook was previously saved to Drive (has file ID)
    // 3. Content has changed since last save
    if (!googleDriveConnected || !driveFileId) {
      return;
    }

    const currentContent = JSON.stringify(notebook, null, 2);

    // Skip if content hasn't changed
    if (currentContent === lastSavedContent) {
      return;
    }

    // Debounce: wait 2 seconds after last change before auto-saving
    const autoSaveTimer = setTimeout(async () => {
      try {
        await updateFileById(driveFileId, currentContent);
        setLastSavedContent(currentContent);
        // Silently save - don't show toast to avoid spam
      } catch (error) {
        console.error("Auto-save failed:", error);
        // Don't show error toast for auto-save failures to avoid spam
        // User can manually save if needed
      }
    }, 2000); // 2 second debounce

    return () => {
      clearTimeout(autoSaveTimer);
    };
  }, [notebook, googleDriveConnected, driveFileId, lastSavedContent]);

  const saveNotebook = () => {
    handleDownload();
  };

  const handleNew = () => {
    if (window.confirm("Start a new notebook? Unsaved changes will be lost.")) {
      setNotebook({
        imnb_version: 1,
        metadata: { title: "New Notebook" },
        cells: [],
      });
      setFilePath("untitled.imnb");
      setDriveFileId(null); // Clear Drive file ID for new notebook
      setLastSavedContent(null);
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

  const addCell = (type: "music" | "markdown", index: number) => {
    if (!notebook) return;
    const newCell: NotebookCell =
      type === "markdown"
        ? {
            cell_type: "markdown",
            source: [
              "# New markdown cell\nDouble click or double tap to edit.",
            ],
          }
        : {
            cell_type: "music",
            metadata: { language: "sargam-v1" },
            source: ["#voice melody", "S R G M"],
          };

    const newCells = [...notebook.cells];
    newCells.splice(index + 1, 0, newCell);
    setNotebook({ ...notebook, cells: newCells });
  };

  const deleteCell = (index: number) => {
    if (!notebook) return;
    const newCells = [...notebook.cells];
    newCells.splice(index, 1);
    setNotebook({ ...notebook, cells: newCells });
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
      toast.success(`Connected to Google Drive as ${user.email}`);
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

  const handleSaveToDrive = () => {
    if (!googleDriveConnected) {
      toast.error("Please connect to Google Drive first");
      return;
    }
    setSaveDialogOpen(true);
  };

  const handleLoadFromDrive = () => {
    if (!googleDriveConnected) {
      toast.error("Please connect to Google Drive first");
      return;
    }
    setLoadDialogOpen(true);
  };

  const handleDriveLoad = (loadedNotebook: Notebook) => {
    setNotebook(loadedNotebook);
    const fileName = loadedNotebook.metadata?.title
      ? `${loadedNotebook.metadata.title}.imnb`
      : "untitled.imnb";
    setFilePath(fileName);
    toast.success("Notebook loaded from Google Drive");
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/10">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        onFileUpload={handleFileUpload}
        onNew={handleNew}
        theme={theme}
        setTheme={setTheme}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        googleDriveConnected={googleDriveConnected}
        googleDriveUser={googleDriveUser}
        onGoogleDriveConnect={handleGoogleDriveConnect}
        onGoogleDriveDisconnect={handleGoogleDriveDisconnect}
        onLoadFromDrive={handleLoadFromDrive}
        onLoadDriveFile={handleDriveLoad}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-muted/5">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0 shadow-sm gap-0.5">
          {/* Mobile menu button */}
          <Button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden"
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <div className="hidden md:flex w-10 h-10 rounded-xl bg-muted items-center justify-center text-muted-foreground shrink-0">
              <FileMusic className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 group">
                {isEditingTitle ? (
                  <Input
                    type="text"
                    value={notebook.metadata?.title || ""}
                    onChange={(e) =>
                      setNotebook({
                        ...notebook,
                        metadata: {
                          ...notebook.metadata,
                          title: e.target.value,
                        },
                      })
                    }
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setIsEditingTitle(false);
                    }}
                    autoFocus
                    className=""
                  />
                ) : (
                  <>
                    <h3
                      onDoubleClick={() => setIsEditingTitle(true)}
                      className="font-bold text-base md:text-xl truncate cursor-text hover:text-primary transition-colors"
                    >
                      {notebook.metadata?.title || "Untitled Notebook"}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate hidden md:block">
                {filePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {googleDriveConnected && (
              <>
                <Button onClick={handleSaveToDrive} variant="default" size="sm">
                  <Cloud className="w-4 h-4" />
                  <span className="hidden sm:inline">Save to Drive</span>
                </Button>
                <Separator
                  orientation="vertical"
                  className="hidden md:block h-4 mx-1"
                />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden md:flex"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-[180px]"
                sideOffset={5}
                align="end"
              >
                <DropdownMenuItem
                  onClick={handleDownload}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <ScrollArea className="flex-1 overflow-hidden h-full">
          <div className="max-w-4xl mx-auto py-6 md:py-12 px-4 md:px-8 w-full min-w-0">
            <div className="w-full min-w-0">
              {notebook.cells.map((cell, idx) => (
                <div key={idx} className="relative">
                  <Cell
                    cell={cell}
                    theme={theme}
                    onChange={(newCell) => {
                      const newCells = [...notebook.cells];
                      newCells[idx] = newCell;
                      setNotebook({ ...notebook, cells: newCells });
                    }}
                    onDelete={() => deleteCell(idx)}
                  />
                  <AddCellControls onAdd={(type) => addCell(type, idx)} />
                </div>
              ))}

              {notebook.cells.length === 0 && (
                <div className="border-2 border-dashed border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center text-muted-foreground gap-4">
                  <Layout className="w-10 h-10 md:w-12 md:h-12 opacity-20" />
                  <div className="text-center">
                    <p className="font-medium text-sm md:text-base">
                      No cells in this notebook
                    </p>
                    <p className="text-xs md:text-sm">
                      Add a cell to start creating music
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
                    <Button
                      onClick={() => addCell("music", -1)}
                      variant="default"
                      size="lg"
                      className="min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" />
                      Music Cell
                    </Button>
                    <Button
                      onClick={() => addCell("markdown", -1)}
                      variant="secondary"
                      size="lg"
                      className="min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" />
                      Markdown Cell
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </main>

      {/* Google Drive Dialogs */}
      <GoogleDriveSaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        notebook={notebook}
        onSave={(fileId) => {
          // Track that this notebook is saved to Drive
          if (fileId) {
            setDriveFileId(fileId);
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
    </div>
  );
}

export default App;
