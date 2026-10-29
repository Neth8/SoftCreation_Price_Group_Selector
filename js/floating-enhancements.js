/**
 * SoftCreation - Floating UI & Modern Glass Scenarios Controller
 * Universal Side Floating Glass Navbar (Desktop & Android)
 * Floating back-to-top button and quick floating action dock.
 */
(function() {
  'use strict';

  function initFloatingUI() {
    const topbar = document.querySelector('.topbar.app-shell-header');
    const nav = document.querySelector('.nav');
    
    // 1. Navigation Event Handling (Smooth closing and active tracking)
    if (nav) {
      // Close side floating navbar when any navigation item is selected
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.navbtn');
        if (btn && typeof window.closeMobileNav === 'function') {
          window.closeMobileNav();
        }
      });
    }

    // Keyboard shortcut to toggle side navbar (Ctrl+M or Alt+M)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.altKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (typeof window.toggleMobileNav === 'function') {
          window.toggleMobileNav();
        }
      }
    });

    // 2. Create Floating Back to Top Button
    const topBtn = document.createElement('button');
    topBtn.className = 'sc-floating-top-btn';
    topBtn.setAttribute('type', 'button');
    topBtn.setAttribute('aria-label', 'Scroll to top');
    topBtn.title = 'Back to top';
    topBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 15l-6-6-6 6"/>
      </svg>
    `;
    topBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(topBtn);

    // 3. Create Floating Quick Action Dock for Editor / Viewer
    const dock = document.createElement('div');
    dock.className = 'sc-floating-dock hidden';
    dock.id = 'scFloatingDock';
    dock.innerHTML = `
      <button type="button" class="sc-floating-dock-btn" id="scDockDashboard" onclick="showView('dashboard')">
        <span>⌂</span> Dashboard
      </button>
      <button type="button" class="sc-floating-dock-btn" id="scDockPrint" onclick="window.print()">
        <span>🖨</span> Quick Print
      </button>
      <button type="button" class="sc-floating-dock-btn primary" id="scDockTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">
        <span>↑</span> Top
      </button>
    `;
    document.body.appendChild(dock);

    // 4. Scroll Listener for Topbar and Floating Controls
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

      // Back to top visibility
      if (currentScroll > 280) {
        topBtn.classList.add('visible');
      } else {
        topBtn.classList.remove('visible');
      }

      // Check if current view is editor or viewer and scrolled down
      const activeView = document.querySelector('.view.active');
      const viewId = activeView ? activeView.id : '';
      if ((viewId === 'editor' || viewId === 'viewer') && currentScroll > 420) {
        dock.classList.remove('hidden');
      } else {
        dock.classList.add('hidden');
      }

      // Topbar shadow depth
      if (topbar) {
        if (currentScroll > 15) {
          topbar.style.boxShadow = 'var(--sc-glass-shadow-floating), 0 0 0 1px var(--sc-teal-glow)';
        } else {
          topbar.style.boxShadow = '';
        }
      }
    }, { passive: true });

    // 5. Wrap showView to keep navbar active states in sync and auto-scroll active button into view
    const origShowView = window.showView;
    if (typeof origShowView === 'function') {
      window.showView = function(viewId) {
        const result = origShowView.apply(this, arguments);
        if (dock) {
          dock.classList.add('hidden');
        }
        if (typeof window.closeMobileNav === 'function') {
          window.closeMobileNav();
        }
        // Auto-scroll active nav button into view in the side floating navbar
        if (nav) {
          setTimeout(() => {
            const activeBtn = nav.querySelector(`.navbtn[data-view="${viewId}"]`);
            if (activeBtn) {
              activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 50);
        }
        return result;
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingUI);
  } else {
    initFloatingUI();
  }
})();
