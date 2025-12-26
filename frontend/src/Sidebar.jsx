import { Music2, Upload, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { PreferenceModal } from './PreferenceModal';

export function Sidebar({ onFileUpload, onNew, theme, setTheme, isOpen, onClose }) {
  const fileInputRef = useRef(null);

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
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0">
        <div className="hidden md:flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">Sargam</span>
        </div>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <div className="px-3 space-y-3">
            <button
              onClick={() => {
                onNew();
                onClose?.();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm active:scale-95 min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" />
              New Notebook
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={onFileUpload}
              accept=".imnb,application/json"
              className="hidden"
            />
            <button
              onClick={() => {
                handleUploadClick();
                onClose?.();
              }}
              className="hover:cursor-pointer w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-bold hover:bg-muted transition-all border border-border shadow-sm active:scale-95 min-h-[44px]"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Local File
            </button>
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
