import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import * as Label from '@radix-ui/react-label';
import { X, Moon, Sun, Settings } from 'lucide-react';
import { cn } from './lib/utils';

export function PreferenceModal({ theme, setTheme }) {
    return (
        <Dialog.Root>
            <Dialog.Trigger asChild>
                <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all group">
                    <Settings className="w-4 h-4" />
                    <span>Preferences</span>
                </button>
            </Dialog.Trigger>

            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-100 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 z-[101] animate-in zoom-in-95 fade-in duration-200 focus:outline-none">
                    <div className="flex items-center justify-between mb-6">
                        <Dialog.Title className="text-xl font-bold">Preferences</Dialog.Title>
                        <Dialog.Close asChild>
                            <button className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label.Root htmlFor="theme-mode" className="text-sm font-semibold">
                                    Theme Mode
                                </Label.Root>
                                <p className="text-xs text-muted-foreground">
                                    Switch between light and dark mode
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Sun className={cn("w-4 h-4", theme === 'light' ? "text-primary" : "text-muted-foreground")} />
                                <Switch.Root
                                    id="theme-mode"
                                    checked={theme === 'dark'}
                                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                                    className="w-11 h-6 bg-muted rounded-full relative shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors data-[state=checked]:bg-primary"
                                >
                                    <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-lg transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                                </Switch.Root>
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
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Framework</span>
                                    <span>React + Radix UI</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <Dialog.Close asChild>
                            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all shadow-sm">
                                Done
                            </button>
                        </Dialog.Close>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
