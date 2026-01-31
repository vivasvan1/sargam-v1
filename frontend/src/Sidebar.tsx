import { Music2, Upload, Plus, Notebook } from 'lucide-react';
import { useRef } from 'react';
import { PreferenceModal } from './PreferenceModal';
import { GoogleDriveSection } from '@/components/google-drive/GoogleDriveSection';
import {
  Sidebar as SidebarComponent,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface GoogleDriveUser {
  email?: string;
  name?: string;
}

interface SidebarProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNew: () => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  isOpen?: boolean; // Kept for compatibility but controlled by SidebarProvider
  onClose?: () => void;
  googleDriveConnected: boolean;
  googleDriveUser: GoogleDriveUser | null;
  onGoogleDriveConnect: () => void;
  onGoogleDriveDisconnect: () => void;
  onLoadFromDrive: () => void;
  onLoadDriveFile: (notebook: any, fileId?: string, isReadOnly?: boolean, isPublished?: boolean) => void;
  currentFileId: string | null;
}

export function Sidebar({
  onFileUpload,
  onNew,
  theme,
  setTheme,
  onClose,
  googleDriveConnected,
  googleDriveUser,
  onGoogleDriveConnect,
  onGoogleDriveDisconnect,
  onLoadFromDrive,
  onLoadDriveFile,
  currentFileId
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setOpenMobile } = useSidebar();

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const closeMobile = () => {
    setOpenMobile(false);
    onClose?.();
  };

  return (
    <SidebarComponent>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <img src="/logo.png" alt="" />
          </div>
          <span className="font-bold text-xl tracking-tight truncate">Sargam Notebook</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        {/* <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                onNew();
                closeMobile();
              }}
              className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              <Plus className="w-4 h-4" />
              <span>New Notebook</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <input
              type="file"
              ref={fileInputRef}
              onChange={onFileUpload}
              accept=".imnb,application/json"
              className="hidden"
            />
            <SidebarMenuButton
              onClick={() => {
                handleUploadClick();
                closeMobile();
              }}
              className="w-full justify-start gap-2"
              variant="outline"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Local File</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu> */}

        <div className="">
          <GoogleDriveSection
            googleDriveConnected={googleDriveConnected}
            googleDriveUser={googleDriveUser}
            onGoogleDriveConnect={onGoogleDriveConnect}
            onGoogleDriveDisconnect={onGoogleDriveDisconnect}
            onLoadFromDrive={onLoadFromDrive}
            onLoadDriveFile={onLoadDriveFile}
            onClose={closeMobile}
            currentFileId={currentFileId}
          />
        </div>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border">
        <PreferenceModal theme={theme} setTheme={setTheme} />
      </SidebarFooter>
    </SidebarComponent>
  );
}

