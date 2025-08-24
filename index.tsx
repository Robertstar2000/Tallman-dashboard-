import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('CRITICAL: Unhandled Promise Rejection:', event.reason);

  // Prevent the default browser handling (e.g., logging to console)
  event.preventDefault();

  const createErrorOverlay = (message: string) => {
    const overlayId = 'critical-error-overlay';
    // Avoid creating multiple overlays if multiple errors fire
    if (document.getElementById(overlayId)) {
        const pre = document.querySelector(`#${overlayId} pre`);
        if(pre) pre.innerHTML += `\n\n--- (Another Error) ---\n\n${message}`;
        return;
    };

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
    overlay.style.color = 'white';
    overlay.style.zIndex = '999999';
    overlay.style.padding = '2rem';
    overlay.style.fontFamily = 'monospace';
    overlay.style.fontSize = '14px';
    overlay.style.overflowY = 'auto';

    const header = document.createElement('h1');
    header.innerText = 'Application Critical Error';
    header.style.color = '#ff8a8a';
    header.style.fontSize = '24px';
    header.style.marginBottom = '1rem';
    header.style.borderBottom = '1px solid #555';
    header.style.paddingBottom = '1rem';

    const pre = document.createElement('pre');
    pre.innerText = message;
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';

    overlay.appendChild(header);
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
  };

  let errorMessage;
  if (event.reason instanceof Error) {
    errorMessage = `[Error] ${event.reason.message}\n\n[Stack Trace]\n${event.reason.stack}`;
  } else {
    try {
      errorMessage = `[Non-Error Object Thrown]\nThis is the likely source of the "uncaught exception: Object" error.\n\nValue: ${JSON.stringify(event.reason, null, 2)}`;
    } catch {
      errorMessage = `[Non-Error Object Thrown]\nCould not stringify reason: ${String(event.reason)}`;
    }
  }
  
  createErrorOverlay(errorMessage);
});


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);