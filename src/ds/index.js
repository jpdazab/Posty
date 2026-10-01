// Design system jpdazab dentro de Posty: tokens, fuentes, estilos y componentes (window.Jpdazab).
import '@fontsource/geist-mono/400.css';
import './tokens.css';
import './bundle.css';
import './react-global.js';
import './bundle.js';

export { default as React } from 'react';
export const Jpdazab = window.Jpdazab;
export const lockupUrl = new URL('./logos/jpdazab-lockup.svg', import.meta.url).href;
