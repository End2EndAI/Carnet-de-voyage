import React from 'react';
import { PRIVACY_URL, TERMS_URL } from '../lib/legal.js';

/**
 * Liens légaux du pied de page. Présents avant la connexion : le Play Store
 * exige que la politique de confidentialité soit atteignable sans compte.
 */
export default function LegalLinks({ className = '' }) {
  return (
    <div className={`flex justify-center gap-3 text-[10px] ${className}`} style={{ color: 'var(--ink-soft)' }}>
      <a href={PRIVACY_URL} className="underline tracking-[.12em] uppercase">Confidentialité</a>
      <a href={TERMS_URL} className="underline tracking-[.12em] uppercase">Conditions</a>
    </div>
  );
}
