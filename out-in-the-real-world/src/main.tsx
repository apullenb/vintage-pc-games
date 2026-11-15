import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { unlockAudio } from './ui/audio.ts';
import { App } from './ui/App.tsx';

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
