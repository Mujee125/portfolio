'use client';

import { useEffect } from 'react';

/**
 * Marks the document once React has hydrated.
 *
 * Renders nothing. It exists so that end-to-end tests (and nothing in the product)
 * can distinguish "the HTML is here" from "the interactive islands are live", which
 * removes an entire class of flaky test that types into an input before hydration.
 */
export function ClientReady() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);

  return null;
}
