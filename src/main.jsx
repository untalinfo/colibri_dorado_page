import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './shared/styles/index.css';

const container = document.getElementById('root');
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Production HTML is prerendered (scripts/prerender.js), so hydrate it; dev serves an empty root.
if (container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, app);
} else {
  ReactDOM.createRoot(container).render(app);
}
