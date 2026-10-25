import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
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
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
