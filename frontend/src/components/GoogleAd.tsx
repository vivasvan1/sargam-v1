import React, { useEffect } from 'react';

interface GoogleAdProps {
  className?: string;
  slot: string;
  client?: string;
}

export const GoogleAd: React.FC<GoogleAdProps> = ({
  className = '',
  slot,
  client = import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT_ID || '',
}) => {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Adsbygoogle push error:', e);
    }
  }, []);

  if (!client) {
    return (
      <div
        className={`w-full bg-muted/30 border border-dashed border-border flex items-center justify-center p-4 text-xs text-muted-foreground rounded-lg h-[90px] ${className}`}
      >
        Google Ad Placeholder (Slot: {slot})
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden flex justify-center py-4 ${className}`}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};
