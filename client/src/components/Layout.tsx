import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  // Nur die Desktop-App erlaubt das Beenden aus der Oberfläche heraus.
  const [canShutdown, setCanShutdown] = useState(false);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setCanShutdown(!!h.canShutdown))
      .catch(() => {});
  }, []);

  async function shutdown() {
    if (!confirm('PrepChef beenden? Deine Daten sind gespeichert.')) return;
    await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    setStopped(true);
  }

  if (stopped) {
    return (
      <div className="shell stopped">
        <h1>PrepChef wurde beendet</h1>
        <p className="muted">Du kannst diesen Tab jetzt schließen. Zum erneuten Start PrepChef wieder öffnen.</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span aria-hidden>🥡</span> PrepChef
        </NavLink>
        <nav>
          <NavLink to="/" end>
            Planen
          </NavLink>
          <NavLink to="/plaene">Pläne</NavLink>
          <NavLink to="/rezepte">Rezepte</NavLink>
          {canShutdown && (
            <button className="quit no-print" onClick={shutdown} title="Server beenden">
              Beenden
            </button>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
