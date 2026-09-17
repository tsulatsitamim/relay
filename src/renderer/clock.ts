type TickListener = () => void;

const listeners = new Set<TickListener>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
    }
  }
}

export function subscribeTick(listener: TickListener): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && timer === null) {
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}