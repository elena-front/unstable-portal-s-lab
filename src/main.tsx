import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { PortalProvider } from './state/PortalContext';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Не найден корневой элемент приложения.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary><PortalProvider><App /></PortalProvider></ErrorBoundary>
  </StrictMode>,
);
