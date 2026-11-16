import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';

// Build-time only: renders the landing to static HTML so crawlers get real content
// without executing JavaScript. The client hydrates this markup (see main.jsx).
export function render() {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
