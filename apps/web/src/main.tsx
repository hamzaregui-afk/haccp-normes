import React from 'react';
import ReactDOM from 'react-dom/client';

// i18n must be imported before any component that uses useTranslation
import './i18n';
import { AppRouter } from './router';
import { QueryProvider } from './providers/QueryProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <AppRouter />
    </QueryProvider>
  </React.StrictMode>,
);
