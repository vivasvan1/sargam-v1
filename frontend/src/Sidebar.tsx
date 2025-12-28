import { Music2, Upload, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { PreferenceModal } from './PreferenceModal';
import { GoogleDriveSection } from './components/GoogleDriveSection';
import { Button } from './components/ui/button';

interface GoogleDriveUser {
  email?: string;
  name?: string;
}

interface SidebarProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNew: () => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  isOpen: boolean;
  onClose: () => void;
  googleDriveConnected: boolean;
  googleDriveUser: GoogleDriveUser | null;
  onGoogleDriveConnect: () => void;
  onGoogleDriveDisconnect: () => void;
  onLoadFromDrive: () => void;
  onLoadDriveFile: (notebook: any) => void;
}

export function Sidebar({ 
  onFileUpload, 
  onNew, 
  theme, 
  setTheme, 
  isOpen, 
  onClose,
  googleDriveConnected,
  googleDriveUser,
  onGoogleDriveConnect,
  onGoogleDriveDisconnect,
  onLoadFromDrive,
  onLoadDriveFile
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Mobile sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        w-64 border-r border-border bg-muted flex flex-col h-screen
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        {/* Mobile close button */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Sargam</span>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon-sm"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      <div className="p-2 flex-1 flex flex-col min-h-0">
        <div className="hidden md:flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">Sargam</span>
        </div>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden min-h-0">
          <div className="px-3 space-y-2 shrink-0">
            <Button
              onClick={() => {
                onNew();
                onClose?.();
              }}
              variant="default"
              size="sm"
              className="w-full"
            >
              <Plus className="w-3.5 h-3.5" />
              New Notebook
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={onFileUpload}
              accept=".imnb,application/json"
              className="hidden"
            />
            <Button
              onClick={() => {
                handleUploadClick();
                onClose?.();
              }}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Local File
            </Button>

            {/* Google Drive Section */}
            <GoogleDriveSection
              googleDriveConnected={googleDriveConnected}
              googleDriveUser={googleDriveUser}
              onGoogleDriveConnect={onGoogleDriveConnect}
              onGoogleDriveDisconnect={onGoogleDriveDisconnect}
              onLoadFromDrive={onLoadFromDrive}
              onLoadDriveFile={onLoadDriveFile}
              onClose={onClose}
            />
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-border">
        <PreferenceModal theme={theme} setTheme={setTheme} />
      </div>
    </aside>
    </>
  );
}

