import { Music2, FileText, ChevronRight } from 'lucide-react';
import { cn } from './lib/utils';
import { PreferenceModal } from './PreferenceModal';

export function Sidebar({ files, activeFile, onFileSelect, theme, setTheme }) {
  return (
    <aside className="w-64 border-r border-border bg-muted/30 flex flex-col h-screen">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Music2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight">Sargam</span>
        </div>

        <nav className="space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-3 mb-2">Notebooks</p>
          {files.map((file) => (
            <button
              key={file}
              onClick={() => onFileSelect(file)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all group",
                activeFile === file
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <FileText className={cn(
                "w-4 h-4 transition-colors",
                activeFile === file ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span className="truncate">{file.replace('.imnb', '')}</span>
              {activeFile === file && <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-border">
        <PreferenceModal theme={theme} setTheme={setTheme} />
      </div>
    </aside>
  );
}
