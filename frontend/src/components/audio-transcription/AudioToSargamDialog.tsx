import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Step1FixSa } from './Step1FixSa';
import { Step2SegmentAudio, type FilterMode } from './Step2SegmentAudio';
import { Step3Transcribe } from './Step3Transcribe';
import { toast } from 'sonner';

interface AudioToSargamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertSargamCell: (sourceLines: string[]) => void;
}

export const AudioToSargamDialog: React.FC<AudioToSargamDialogProps> = ({
  open,
  onOpenChange,
  onInsertSargamCell,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioName, setAudioName] = useState<string>('');
  const [confirmedSa, setConfirmedSa] = useState<{
    pitch: string;
    frequency: number;
  } | null>(null);
  const [activeAudioBuffer, setActiveAudioBuffer] = useState<AudioBuffer | null>(null);
  const [filterUsed, setFilterUsed] = useState<FilterMode>('raw');
  const [dialogKey, setDialogKey] = useState<number>(0);

  const resetState = () => {
    setStep(1);
    setRawAudioBuffer(null);
    setActiveAudioBuffer(null);
    setConfirmedSa(null);
    setAudioName('');
    setFilterUsed('raw');
    setDialogKey((prev) => prev + 1);
  };

  // Reset and clear previous state whenever dialog closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleAudioLoaded = (buffer: AudioBuffer, name: string) => {
    setRawAudioBuffer(buffer);
    setActiveAudioBuffer(buffer);
    setAudioName(name);
  };

  const handleConfirmSa = (sa: { pitch: string; frequency: number }) => {
    setConfirmedSa(sa);
  };

  const handleFilterConfirmed = (filteredBuffer: AudioBuffer, filter: FilterMode) => {
    setActiveAudioBuffer(filteredBuffer);
    setFilterUsed(filter);
    setStep(3);
  };

  const handleSkipFilter = () => {
    setActiveAudioBuffer(rawAudioBuffer);
    setFilterUsed('raw');
    setStep(3);
  };

  const handleInsertCell = (sargamCode: string) => {
    const lines = sargamCode.split('\n');
    onInsertSargamCell(lines);
    handleOpenChange(false);
    toast.success('Transcribed Sargam cell added to notebook!');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        key={dialogKey}
        className="w-[96vw] max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
      >
        {/* Sticky Header with Step Breadcrumb */}
        <div className="p-4 sm:p-6 md:p-5 pb-2 shrink-0 border-b border-border bg-card/60 backdrop-blur-xs pr-12">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center justify-between">
              <span>Audio to Sargam Notation</span>
            </DialogTitle>
          </DialogHeader>

          {/* Step Breadcrumb / Progress Bar */}
          <div className="flex items-center justify-between pt-3 text-xs">
            <div
              className={`flex items-center gap-1.5 font-medium cursor-pointer ${
                step === 1 ? 'text-primary' : 'text-muted-foreground'
              }`}
              onClick={() => setStep(1)}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 1
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                1
              </span>
              <span>Fix Sa</span>
            </div>

            <div className="h-px w-6 sm:w-10 bg-border" />

            <div
              className={`flex items-center gap-1.5 font-medium ${
                step === 2
                  ? 'text-primary'
                  : !rawAudioBuffer || !confirmedSa
                  ? 'opacity-40 cursor-not-allowed'
                  : 'text-muted-foreground cursor-pointer'
              }`}
              onClick={() => {
                if (rawAudioBuffer && confirmedSa) setStep(2);
              }}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 2
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                2
              </span>
              <span>Filter (Optional)</span>
            </div>

            <div className="h-px w-6 sm:w-10 bg-border" />

            <div
              className={`flex items-center gap-1.5 font-medium ${
                step === 3
                  ? 'text-primary'
                  : !rawAudioBuffer || !confirmedSa
                  ? 'opacity-40 cursor-not-allowed'
                  : 'text-muted-foreground cursor-pointer'
              }`}
              onClick={() => {
                if (rawAudioBuffer && confirmedSa) setStep(3);
              }}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 3
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                3
              </span>
              <span>Transcribe &amp; Verify</span>
            </div>
          </div>
        </div>

        {/* Scrollable Step Views: min-h-0 and overflow-y-auto ensure smooth scrolling when content overflows */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-7 py-4 overscroll-contain">
          {step === 1 && (
            <Step1FixSa
              audioBuffer={rawAudioBuffer}
              onAudioLoaded={handleAudioLoaded}
              confirmedSa={confirmedSa}
              onConfirmSa={handleConfirmSa}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && rawAudioBuffer && confirmedSa && (
            <Step2SegmentAudio
              audioBuffer={rawAudioBuffer}
              saPitch={confirmedSa.pitch}
              onFilterConfirmed={handleFilterConfirmed}
              onSkip={handleSkipFilter}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && activeAudioBuffer && confirmedSa && (
            <Step3Transcribe
              audioBuffer={activeAudioBuffer}
              saPitch={confirmedSa.pitch}
              saFrequency={confirmedSa.frequency}
              onInsertCell={handleInsertCell}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
