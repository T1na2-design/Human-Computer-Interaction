// Tiny fetch wrapper used by app.js. Cookies carry the login session.
window.api = (() => {
  async function call(path, method = 'GET', body) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) { const e = new Error(data?.error || 'Request failed'); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  return {
    me: () => call('/me'),
    updateMe: b => call('/me', 'PATCH', b),
    resetProgress: () => call('/me/reset', 'POST'),
    deleteAccount: () => call('/me', 'DELETE'),
    register: b => call('/auth/register', 'POST', b),
    login: b => call('/auth/login', 'POST', b),
    logout: () => call('/auth/logout', 'POST'),
    startQuiz: mode => call('/quiz/start', 'POST', { mode }),
    answer: (runId, questionId, choice) => call(`/quiz/${runId}/answer`, 'POST', { questionId, choice }),
    finish: runId => call(`/quiz/${runId}/finish`, 'POST'),
    leaderboard: scope => call('/leaderboard?scope=' + (scope === 'My Modules' ? 'modules' : 'global')),
    tutor: (message, history) => call('/tutor', 'POST', { message, history })
  };
})();
