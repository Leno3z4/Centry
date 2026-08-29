'use client';

import { useEffect } from 'react';

export function MobileMenuController() {
  useEffect(() => {
    const setup = () => {
      const sidebar = document.querySelector('.app-shell .sidebar');
      if (!sidebar || sidebar.querySelector('.mobile-menu-button')) return false;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mobile-menu-button';
      button.setAttribute('aria-label', 'Open navigation menu');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<span class="mobile-menu-icon" aria-hidden="true"></span>';

      const toggle = () => {
        const open = sidebar.classList.toggle('mobile-nav-open');
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      };

      button.addEventListener('click', toggle);
      sidebar.appendChild(button);

      const closeOnNavigation = (event) => {
        if (!event.target.closest('.nav-item')) return;
        sidebar.classList.remove('mobile-nav-open');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Open navigation menu');
      };
      sidebar.addEventListener('click', closeOnNavigation);

      return () => {
        button.removeEventListener('click', toggle);
        sidebar.removeEventListener('click', closeOnNavigation);
        button.remove();
      };
    };

    let cleanup = setup();
    if (cleanup) return cleanup;

    const observer = new MutationObserver(() => {
      const result = setup();
      if (result) {
        cleanup = result;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (cleanup) cleanup();
    };
  }, []);

  return null;
}
