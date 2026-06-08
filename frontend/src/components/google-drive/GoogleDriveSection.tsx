import { Cloud, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GoogleDriveBrowser } from './GoogleDriveBrowser';
import { PublicBrowser } from './PublicBrowser';
import { FaGoogleDrive } from 'react-icons/fa';

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
  onLoadDriveFile?: (
    notebook: any,
    fileId?: string,
    isReadOnly?: boolean,
    isPublished?: boolean,
    ownerEmail?: string
  ) => void;
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
  currentFileId,
}: GoogleDriveSectionProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <Tabs defaultValue="public" className="flex-1 flex flex-col min-h-0">
        <div className="px-3 shrink-0">
          <TabsList className="w-full h-8 p-1 bg-muted/50">
            <TabsTrigger value="public" className="flex-1 h-6 text-xs">
              Community
            </TabsTrigger>
            <TabsTrigger value="personal" className="flex-1 h-6 text-xs">
              My Drive
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 mt-2">
          <TabsContent
            value="public"
            className="h-full m-0 data-[state=inactive]:hidden flex flex-col"
          >
            <PublicBrowser
              onLoadFile={onLoadDriveFile}
              onClose={onClose}
              currentFileId={currentFileId}
            />
          </TabsContent>

          <TabsContent
            value="personal"
            className="h-full m-0 data-[state=inactive]:hidden flex flex-col"
          >
            {/* Connection Status & Actions */}
            <div className="px-2 pb-2 shrink-0">
              {!googleDriveConnected ? (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <Button
                    onClick={() => {
                      onGoogleDriveConnect?.();
                    }}
                    variant="default"
                    className="w-full h-auto whitespace-normal py-2"
                  >
                    <FaGoogleDrive className="w-3.5 h-3.5 mr-2 shrink-0" />
                    Connect Google Drive
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 h-full">
                  <div className="flex items-center justify-between gap-2 mb-2">
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

                  <div className="flex-1 min-h-0">
                    <GoogleDriveBrowser
                      onLoadFile={onLoadDriveFile}
                      onClose={onClose}
                      currentFileId={currentFileId}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
