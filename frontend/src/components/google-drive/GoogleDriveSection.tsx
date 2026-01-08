import React from 'react';
import { Cloud, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GoogleDriveBrowser } from './GoogleDriveBrowser';
import { PublicBrowser } from './PublicBrowser';
import { FaGoogleDrive } from "react-icons/fa";

interface GoogleDriveUser {
  email?: string;
  name?: string;
}

interface GoogleDriveSectionProps {
  googleDriveConnected: boolean;
  googleDriveUser: GoogleDriveUser | null;
  onGoogleDriveConnect?: () => void;
  onGoogleDriveDisconnect?: () => void;
  onLoadFromDrive?: () => void;
  onLoadDriveFile?: (notebook: any, fileId?: string) => void;
  onClose?: () => void;
  currentFileId?: string | null;
}

export function GoogleDriveSection({
  googleDriveConnected,
  googleDriveUser,
  onGoogleDriveConnect,
  onGoogleDriveDisconnect,
  onLoadDriveFile,
  onClose,
  currentFileId
}: GoogleDriveSectionProps) {
  const [activeTab, setActiveTab] = React.useState<"personal" | "public">("personal");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Connection Status & Actions */}
      <div className="px-3 space-y-2 shrink-0">
        {!googleDriveConnected ? (
          <Button
            onClick={() => {
              onGoogleDriveConnect?.();
              onClose?.();
            }}
            variant="default"
            size="sm"
            className="w-full"
          >
            <FaGoogleDrive className="w-3.5 h-3.5" />
            Google Drive
          </Button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Cloud className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium text-primary truncate">
                  {googleDriveUser?.email || 'Connected'}
                </span>
              </div>
              <Button
                onClick={() => {
                  onGoogleDriveDisconnect?.();
                }}
                variant="destructive"
                size="icon-sm"
                title="Disconnect"
              >
                <LogOut className="w-3 h-3" />
              </Button>
            </div>

            <div className="flex w-full gap-1">
              <Button
                variant={activeTab === "personal" ? "default" : "ghost"}
                onClick={() => setActiveTab("personal")}
                className="flex-1 h-7 text-xs"
              >
                My Drive
              </Button>
              <Button
                variant={activeTab === "public" ? "default" : "ghost"}
                onClick={() => setActiveTab("public")}
                className="flex-1 h-7 text-xs"
              >
                Community
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* File Browser */}
      {googleDriveConnected && (
        <div className="flex-1 min-h-0 flex flex-col mt-2">
          {activeTab === "personal" ? (
            <GoogleDriveBrowser
              onLoadFile={onLoadDriveFile}
              onClose={onClose}
              currentFileId={currentFileId}
            />
          ) : (
            <PublicBrowser
              onLoadFile={onLoadDriveFile}
              onClose={onClose}
              currentFileId={currentFileId}
            />
          )}
        </div>
      )}
    </div>
  );
}

