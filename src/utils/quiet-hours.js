/**
 * Quiet-hours utility — determines whether the current time falls within
 * a configured "do not disturb" window.
 *
 * Supports cross-midnight ranges (e.g. 22:00–08:00) via OR logic.
 */

/**
 * @param {{ start: number, end: number } | null | undefined} quietHours
 *   start/end are 0-based hours (0–23, inclusive).
 * @returns {boolean}
 */
function isInQuietHours(quietHours) {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  if (typeof start !== 'number' || typeof end !== 'number') return false;
  const hour = new Date().getHours();
  // Cross-midnight range (e.g. 22:00–08:00) — use OR logic
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

module.exports = { isInQuietHours };
