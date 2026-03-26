/**
 * Pino Browser Shim
 * Provides a minimal pino-compatible interface for browser environments
 */

const noop = () => {};

const createLogger = () => ({
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  silent: noop,
  child: () => createLogger(),
  bindings: () => ({}),
  flush: noop,
  level: 'silent',
  levelVal: 100,
  levels: {
    values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 },
    labels: { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' }
  }
});

// Default export
export default createLogger;

// Named exports
export const pino = createLogger;
export const destination = noop;
export const transport = noop;
export const multistream = noop;
export const stdTimeFunctions = {};
export const stdSerializers = {};
export const symbols = {};
export const levels = {
  values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 },
  labels: { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' }
};
