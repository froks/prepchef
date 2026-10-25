import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { PlannerPage } from './pages/PlannerPage.tsx';
import { PlanPage } from './pages/PlanPage.tsx';
import { PlansPage } from './pages/PlansPage.tsx';
import { RecipeDetailPage } from './pages/RecipeDetailPage.tsx';
import { RecipeEditorPage } from './pages/RecipeEditorPage.tsx';
import { RecipesPage } from './pages/RecipesPage.tsx';
import './styles.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <PlannerPage /> },
      { path: '/plaene', element: <PlansPage /> },
      { path: '/plaene/:id', element: <PlanPage /> },
      { path: '/rezepte', element: <RecipesPage /> },
      { path: '/rezepte/neu', element: <RecipeEditorPage /> },
      { path: '/rezepte/:id', element: <RecipeDetailPage /> },
      { path: '/rezepte/:id/bearbeiten', element: <RecipeEditorPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
