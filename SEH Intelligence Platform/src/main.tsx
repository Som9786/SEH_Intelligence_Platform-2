import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, initialTheme } from './shared/hooks/useTheme';
import '@fontsource-variable/inter';
import './styles/index.css';

applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
