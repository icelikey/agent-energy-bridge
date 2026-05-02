const LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
});

class Logger {
  constructor(options = {}) {
    this.namespace = options.namespace || 'aeb';
    const effectiveLevel = options.level || process.env.AEB_LOG_LEVEL || 'info';
    this.level = LEVELS[effectiveLevel] ?? LEVELS.info;
    this.sink = options.sink || { write: (line) => process.stderr.write(line + '\n') };
  }

  _log(levelLabel, message, meta) {
    const levelValue = LEVELS[levelLabel] ?? LEVELS.info;
    if (levelValue < this.level) return;

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    this.sink.write(`[${timestamp}] [${levelLabel.toUpperCase()}] [${this.namespace}] ${message}${metaStr}`);
  }

  debug(message, meta) { this._log('debug', message, meta); }
  info(message, meta) { this._log('info', message, meta); }
  warn(message, meta) { this._log('warn', message, meta); }
  error(message, meta) { this._log('error', message, meta); }
}

module.exports = {
  Logger,
  LEVELS,
};
