import { Dialog, DialogContent, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Moon, Sun, Settings } from 'lucide-react';
import { cn } from './lib/utils';

interface PreferenceModalProps {
    theme: "light" | "dark" | "system";
    setTheme: (theme: "light" | "dark" | "system") => void;
}

export function PreferenceModal({ theme, setTheme }: PreferenceModalProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all group">
                    <Settings className="w-4 h-4" />
                    <span>Preferences</span>
                </button>
            </DialogTrigger>

            <DialogContent className="max-w-md">
                <div className="flex items-center justify-between mb-6">
                    <DialogTitle className="text-xl font-bold">Preferences</DialogTitle>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="theme-mode" className="text-sm font-semibold">
                                Theme Mode
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Switch between light and dark mode
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Sun className={cn("w-4 h-4", theme === 'light' ? "text-primary" : "text-muted-foreground")} />
                            <Switch
                                id="theme-mode"
                                checked={theme === 'dark'}
                                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                            />
                            <Moon className={cn("w-4 h-4", theme === 'dark' ? "text-primary" : "text-muted-foreground")} />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-4">
                            About Sargam
                        </p>
                        <div className="bg-muted/30 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Version</span>
                                <span className="font-mono">0.1.0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <DialogClose asChild>
                        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all shadow-sm">
                            Done
                        </button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
}

