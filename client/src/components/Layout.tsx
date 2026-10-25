import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { isDesktopWindow, quitApp } from '../desktop.ts';
import { ConfirmButton } from './ConfirmButton.tsx';

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
    // Im App-Fenster schließt sich das Fenster selbst; im Browser bleibt der Tab mit einem Hinweis offen.
    const inWindow = isDesktopWindow();
    await quitApp();
    if (!inWindow) setStopped(true);
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
            <ConfirmButton className="quit no-print" onConfirm={shutdown} confirmLabel="Wirklich beenden?" title="PrepChef beenden – deine Daten sind gespeichert">
              Beenden
            </ConfirmButton>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
