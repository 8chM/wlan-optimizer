<!--
  Sidebar.svelte - Collapsible sidebar with navigation links.

  Supports collapsed/expanded state with smooth CSS transitions.
  Shows navigation items with icons and labels. Auto-collapses
  when the window width is less than 1024px. Used in the editor layout.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import type { Snippet } from 'svelte';

  interface SidebarProps {
    projectId?: string;
    children?: Snippet;
  }

  let {
    projectId = '',
    children,
  }: SidebarProps = $props();

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    href: string;
  }

  let navItems = $derived<NavItem[]>(
    projectId
      ? [
          { id: 'editor', label: 'nav.editor', icon: '\u270E', href: `/project/${projectId}/editor` },
          { id: 'measure', label: 'nav.measure', icon: '\uD83D\uDCCA', href: `/project/${projectId}/measure` },
          { id: 'mixing', label: 'nav.mixing', icon: '\uD83C\uDF9B', href: `/project/${projectId}/mixing` },
          { id: 'results', label: 'nav.results', icon: '\uD83D\uDCC8', href: `/project/${projectId}/results` },
        ]
      : []
  );

  let collapsed = $derived(canvasStore.sidebarCollapsed);
  let currentPath = $derived($page.url.pathname);

  function toggleCollapsed(): void {
    canvasStore.toggleSidebar();
  }

  // Auto-collapse on narrow viewports
  $effect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 1023px)');

    function handleChange(e: MediaQueryListEvent | MediaQueryList): void {
      canvasStore.setSidebarCollapsed(e.matches);
    }

    // Set initial state
    handleChange(mediaQuery);

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  });
</script>

<aside class="sidebar" class:collapsed style="width: {collapsed ? '48px' : '220px'}">
  <div class="sidebar-header">
    <button
      class="toggle-btn"
      onclick={toggleCollapsed}
      title={collapsed ? t('action.expandSidebar') : t('action.collapseSidebar')}
      aria-label={collapsed ? t('action.expandSidebar') : t('action.collapseSidebar')}
    >
      <span class="toggle-icon">{collapsed ? '\u2630' : '\u25C2'}</span>
    </button>
  </div>

  {#if navItems.length > 0}
    <nav class="sidebar-nav">
      {#each navItems as item (item.id)}
        <a
          href={item.href}
          class="nav-item"
          class:active={currentPath === item.href}
          title={collapsed ? t(item.label) : ''}
        >
          <span class="nav-icon">{item.icon}</span>
          {#if !collapsed}
            <span class="nav-label">{t(item.label)}</span>
          {/if}
        </a>
      {/each}
    </nav>
  {/if}

  {#if children && !collapsed}
    <div class="sidebar-content">
      {@render children()}
    </div>
  {/if}

  <div class="sidebar-footer">
    <a href="/" class="nav-item" class:active={currentPath === '/'} title={collapsed ? t('nav.projects') : ''}>
      <span class="nav-icon">{'\uD83C\uDFE0'}</span>
      {#if !collapsed}
        <span class="nav-label">{t('nav.projects')}</span>
      {/if}
    </a>
    <a href="/settings" class="nav-item" class:active={currentPath === '/settings'} title={collapsed ? t('nav.settings') : ''}>
      <span class="nav-icon">{'\u2699'}</span>
      {#if !collapsed}
        <span class="nav-label">{t('nav.settings')}</span>
      {/if}
    </a>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    background: #1a1a2e;
    color: #c0c0d0;
    flex-shrink: 0;
    transition: width 0.2s ease;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: flex-end;
    padding: 8px;
    border-bottom: 1px solid #2a2a4e;
  }

  .sidebar.collapsed .sidebar-header {
    justify-content: center;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    color: #808090;
    cursor: pointer;
    border-radius: 4px;
    font-size: 1rem;
    transition: background 0.15s ease;
  }

  .toggle-btn:hover {
    background: #2a2a4e;
    color: #e0e0f0;
  }

  .toggle-icon {
    line-height: 1;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    text-decoration: none;
    color: #c0c0d0;
    border-radius: 6px;
    font-size: 0.85rem;
    transition: background 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
  }

  .sidebar.collapsed .nav-item {
    justify-content: center;
    padding: 10px 8px;
  }

  .nav-item:hover {
    background: #2a2a4e;
    color: #ffffff;
  }

  .nav-item.active {
    background: rgba(74, 108, 247, 0.2);
    color: #4a6cf7;
  }

  .nav-icon {
    flex-shrink: 0;
    width: 20px;
    text-align: center;
    font-size: 1rem;
  }

  .nav-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    border-top: 1px solid #2a2a4e;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 8px;
    border-top: 1px solid #2a2a4e;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
