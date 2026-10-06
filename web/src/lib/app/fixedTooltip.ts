// Hover tooltips in the projection / cash-flow tables (results.js): positioned with
// position: fixed so the scrolling table container doesn't clip them and they show
// in front of the sticky header.
const GAP = 8;
const MARGIN = 4;

function place(trigger: HTMLElement, tip: HTMLElement): void {
  tip.classList.add('tooltip-fixed');
  tip.classList.remove('tooltip-below');
  const r = trigger.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = tip.classList.contains('tooltip-content-right-align') ? r.right - w : r.left + r.width / 2 - w / 2;
  left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
  let top = r.top - h - GAP;
  if (top < MARGIN && r.bottom + GAP + h <= vh - MARGIN) {
    top = r.bottom + GAP;
    tip.classList.add('tooltip-below');
  }
  // 'important' so .tooltip-content-right-align's !important rules don't win.
  tip.style.setProperty('left', left + 'px', 'important');
  tip.style.setProperty('right', 'auto', 'important');
  tip.style.top = top + 'px';
}

function reset(tip: HTMLElement): void {
  tip.classList.remove('tooltip-fixed', 'tooltip-below');
  tip.style.removeProperty('left');
  tip.style.removeProperty('right');
  tip.style.top = '';
}

// One hovered tooltip at a time, repositioned on scroll / resize by shared listeners.
let active: { trigger: HTMLElement; tip: HTMLElement } | null = null;
let listening = false;
const reposition = () => {
  if (active) place(active.trigger, active.tip);
};

/** Svelte action for a `.tooltip-trigger` element containing a `.tooltip-content`. */
export function fixedTooltip(trigger: HTMLElement) {
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    window.addEventListener('resize', reposition);
  }
  const enter = () => {
    const tip = trigger.querySelector<HTMLElement>('.tooltip-content');
    if (!tip) return;
    active = { trigger, tip };
    place(trigger, tip);
  };
  const leave = () => {
    const tip = trigger.querySelector<HTMLElement>('.tooltip-content');
    if (active?.trigger === trigger) active = null;
    if (tip) reset(tip);
  };
  trigger.addEventListener('mouseenter', enter);
  trigger.addEventListener('mouseleave', leave);
  return {
    destroy() {
      if (active?.trigger === trigger) active = null;
      trigger.removeEventListener('mouseenter', enter);
      trigger.removeEventListener('mouseleave', leave);
    },
  };
}
