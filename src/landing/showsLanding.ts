const PHONE_SHORT_SIDE = 600;

export const hasSmallWindow = () =>
  typeof window !== 'undefined' && Math.min(innerWidth, innerHeight) < PHONE_SHORT_SIDE;

const asksForLanding = () => new URLSearchParams(location.search).has('landing');

export const showsLanding = () => hasSmallWindow() || asksForLanding();
