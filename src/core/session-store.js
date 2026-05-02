class SessionStore {
  constructor(options = {}) {
    this.sessions = [];
    this.maxSize = Number(options.maxSize ?? 1000);
  }

  addSession(scoredSession) {
    this.sessions.push({
      ...scoredSession,
      storedAt: new Date().toISOString(),
    });
    if (this.sessions.length > this.maxSize) {
      this.sessions = this.sessions.slice(-this.maxSize);
    }
    return this.sessions.length;
  }

  getRecentSessions(limit = 100) {
    return this.sessions.slice(-limit);
  }

  getSessionsByTaskType(taskType, limit = 100) {
    return this.sessions
      .filter((s) => s.taskType === taskType)
      .slice(-limit);
  }

  getSessionsByModel(model, limit = 100) {
    return this.sessions
      .filter((s) => s.model === model)
      .slice(-limit);
  }

  clear() {
    this.sessions = [];
  }

  size() {
    return this.sessions.length;
  }
}

module.exports = {
  SessionStore,
};
