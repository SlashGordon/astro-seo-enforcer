// Tiny, dependency-free ANSI colouring that respects NO_COLOR / FORCE_COLOR.

const noColor = 'NO_COLOR' in process.env || process.env.FORCE_COLOR === '0';
const forceColor = typeof process.env.FORCE_COLOR === 'string' && process.env.FORCE_COLOR !== '0';
const enabled = !noColor && (forceColor || process.stdout.isTTY === true);

function wrap(open: number, close: number): (text: string) => string {
  return (text: string) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text);
}

export const red = wrap(31, 39);
export const yellow = wrap(33, 39);
export const green = wrap(32, 39);
export const dim = wrap(2, 22);
export const bold = wrap(1, 22);
