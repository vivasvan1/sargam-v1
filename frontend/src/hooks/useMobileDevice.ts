import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the device is a mobile/touch device
 * @returns {boolean} true if the device is a mobile/touch device, false otherwise
 */
export function useMobileDevice(): boolean {
    const [isMobileDevice, setIsMobileDevice] = useState(false);

    useEffect(() => {
        // Check for touch support
        const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Check for mobile user agent (optional, more comprehensive)
        const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        );
        
        // Check for small screen size (optional, helps catch desktop browsers in mobile mode)
        const isSmallScreen = window.innerWidth <= 768;
        
        // Consider it mobile if it has touch support OR (mobile user agent AND small screen)
        setIsMobileDevice(hasTouchSupport || (isMobileUserAgent && isSmallScreen));
        
        // Optional: Listen for resize events to update on orientation change
        const handleResize = () => {
            const isSmallScreenNow = window.innerWidth <= 768;
            setIsMobileDevice(hasTouchSupport || (isMobileUserAgent && isSmallScreenNow));
        };
        
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return isMobileDevice;
}

