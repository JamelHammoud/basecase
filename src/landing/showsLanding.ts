const PHONE_SHORT_SIDE = 600;

const hasSmallWindow = () => Math.min(innerWidth, innerHeight) < PHONE_SHORT_SIDE;

const asksForLanding = () => new URLSearchParams(location.search).has('landing');

export const showsLanding = () => hasSmallWindow() || asksForLanding();
