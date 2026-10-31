const TURN_SETTLED_MS = 520;
const EXIT_MS = 300;

let finishing = false;

function untilSettled(boot: HTMLElement): number {
  const turn = boot.getAnimations({ subtree: true }).find((a) => (a as CSSAnimation).animationName === 'boot-turn');
  const elapsed = Number(turn?.currentTime ?? TURN_SETTLED_MS);

  return Math.max(0, TURN_SETTLED_MS - elapsed);
}

export function finishBoot() {
  const boot = document.getElementById('boot');

  if (!boot || finishing) return;

  finishing = true;

  const root = document.documentElement;

  setTimeout(() => {
    root.classList.replace('booting', 'boot-leaving');
    setTimeout(() => {
      boot.remove();
      root.classList.remove('boot-leaving');
    }, EXIT_MS);
  }, untilSettled(boot));
}
