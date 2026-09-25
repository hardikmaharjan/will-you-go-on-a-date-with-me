import { useEffect, useState } from 'react';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function formatSubmitted(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('planInboxToken') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadPlans(accessToken) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/plans', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load plans.');
      setPlans(result.plans);
      setAuthenticated(true);
    } catch (loadError) {
      sessionStorage.removeItem('planInboxToken');
      setToken('');
      setAuthenticated(false);
      setError(loadError.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadPlans(token);
  }, [token]);

  function signIn(event) {
    event.preventDefault();
    if (!password.trim()) return;
    sessionStorage.setItem('planInboxToken', password.trim());
    setToken(password.trim());
    setPassword('');
  }

  function signOut() {
    sessionStorage.removeItem('planInboxToken');
    setToken('');
    setAuthenticated(false);
    setPlans([]);
  }

  return (
    <main className="admin-page">
      <div className="admin-glow" aria-hidden="true" />
      <section className="admin-card">
        <a className="admin-back" href="/">← Back to the invitation</a>
        <p className="eyebrow">your little inbox ♡</p>
        <h1>Date <em>plans</em></h1>
        {!authenticated ? (
          <form className="admin-login" onSubmit={signIn}>
            <p className="subcopy">Enter your admin password to see the plans they send.</p>
            <label htmlFor="adminPassword">Admin password</label>
            <input id="adminPassword" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="submission-error" role="alert">{error}</p>}
            <button className="yes-button" disabled={loading}>{loading ? 'Checking…' : 'Open my inbox'}</button>
            <p className="admin-hint">On this computer, find the password in <code>.local-admin-password</code>.</p>
          </form>
        ) : (
          <>
            <div className="admin-toolbar"><span>{plans.length} {plans.length === 1 ? 'plan' : 'plans'} received</span><div><button className="text-button" onClick={() => loadPlans(token)}>Refresh</button><button className="text-button" onClick={signOut}>Log out</button></div></div>
            {error && <p className="submission-error" role="alert">{error}</p>}
            {loading && plans.length === 0 ? <p className="admin-empty">Loading your inbox…</p> : plans.length === 0 ? <p className="admin-empty">No plans yet. When someone finishes the invitation, their plan will appear here ♡</p> : (
              <div className="plan-list">
                {plans.map((plan) => <article className="received-plan" key={plan.submissionId}>
                  <div className="received-plan-heading"><div><span>THE DATE</span><h2>{plan.activity}</h2></div><time dateTime={plan.createdAt}>{formatSubmitted(plan.createdAt)}</time></div>
                  <p className="received-day"><span>THE DAY</span><strong>{formatDate(plan.date)}</strong></p>
                  <blockquote>“{plan.note}”</blockquote>
                </article>)}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
