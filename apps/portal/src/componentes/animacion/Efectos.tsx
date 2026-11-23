'use client';

import { useEffect } from 'react';
import { iniciarEfectos } from './arranque';

/** Arranca los efectos del diseño sobre el marcado estático de la página y los apaga al salir. */
export function Efectos() {
  useEffect(() => iniciarEfectos(), []);
  return null;
}
