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
      button.setAttribute('aria-controls', 'mobile-navigation');
      button.innerHTML = '<span class="mobile-menu-icon" aria-hidden="true"></span>';

      const nav = sidebar.querySelector('.side-nav');
      if (nav) nav.id = 'mobile-navigation';

      const setOpen = (open) => {
        sidebar.classList.toggle('mobile-nav-open', open);
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      };

      const toggle = () => setOpen(!sidebar.classList.contains('mobile-nav-open'));

      button.addEventListener('click', toggle);

      const closeOnNavigation = (event) => {
        if (!event.target.closest('.nav-item')) return;
        setOpen(false);
      };
      sidebar.addEventListener('click', closeOnNavigation);

      const closeOnEscape = (event) => {
        if (event.key === 'Escape') setOpen(false);
      };
      document.addEventListener('keydown', closeOnEscape);

      const closeOnOutsideClick = (event) => {
        if (!sidebar.classList.contains('mobile-nav-open')) return;
        if (sidebar.contains(event.target)) return;
        setOpen(false);
      };
      document.addEventListener('pointerdown', closeOnOutsideClick);

      const closeOnDesktop = () => {
        if (window.innerWidth > 760) setOpen(false);
      };
      window.addEventListener('resize', closeOnDesktop);

      sidebar.appendChild(button);

      return () => {
        button.removeEventListener('click', toggle);
        sidebar.removeEventListener('click', closeOnNavigation);
        document.removeEventListener('keydown', closeOnEscape);
        document.removeEventListener('pointerdown', closeOnOutsideClick);
        window.removeEventListener('resize', closeOnDesktop);
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
