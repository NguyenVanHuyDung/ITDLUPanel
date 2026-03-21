import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const SMALL_MOBILE_BREAKPOINT = 480;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export function useIsSmallMobile() {
  const [isSmall, setIsSmall] = useState(window.innerWidth < SMALL_MOBILE_BREAKPOINT);
  useEffect(() => {
    const handler = () => setIsSmall(window.innerWidth < SMALL_MOBILE_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isSmall;
}

export function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return {
    xs: width < SMALL_MOBILE_BREAKPOINT,
    sm: width < MOBILE_BREAKPOINT,
    md: width >= MOBILE_BREAKPOINT && width < 1024,
    lg: width >= 1024,
    width,
  };
}
