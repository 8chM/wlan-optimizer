<!--
  Sidebar.svelte - Collapsible sidebar with navigation links.

  Supports collapsed/expanded state. Shows navigation items
  with icons and labels. Used in the editor layout.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Snippet } from 'svelte';

  interface SidebarProps {
    collapsed?: boolean;
    onToggle?: () => void;
    projectId?: string;
    children?: Snippet;
  }

  let {
    collapsed = $bindable(false),
    onToggle,
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
          { id: 'editor', label: 'nav.editor', icon: '✎', href: `/project/${projectId}/editor` },
          { id: 'measure', label: 'nav.measure', icon: '📊', href: `/project/${projectId}/measure` },
          { id: 'mixing', label: 'nav.mixing', icon: '🎛', href: `/project/${projectId}/mixing` },
          { id: 'results', label: 'nav.results', icon: '📈', href: `/project/${projectId}/results` },
        ]
      : []
  );

  function toggleCollapsed(): void {
    collapsed = !collapsed;
    onToggle?.();
  }
</script>

<aside class="sidebar" class:collapsed>
  <div class="sidebar-header">
    <button class="toggle-btn" onclick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
      <span class="toggle-icon">{collapsed ? '▸' : '◂'}</span>
    </button>
  </div>

  {#if navItems.length > 0}
    <nav class="sidebar-nav">
      {#each navItems as item (item.id)}
        <a href={item.href} class="nav-item" title={t(item.label)}>
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
    <a href="/" class="nav-item" title={t('nav.projects')}>
      <span class="nav-icon">🏠</span>
      {#if !collapsed}
        <span class="nav-label">{t('nav.projects')}</span>
      {/if}
    </a>
    <a href="/settings" class="nav-item" title={t('nav.settings')}>
      <span class="nav-icon">⚙</span>
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
    width: 220px;
    background: #1a1a2e;
    color: #c0c0d0;
    flex-shrink: 0;
    transition: width 0.2s ease;
    overflow: hidden;
  }

  .sidebar.collapsed {
    width: 52px;
  }

  .sidebar-header {
    display: flex;
    justify-content: flex-end;
    padding: 8px;
    border-bottom: 1px solid #2a2a4e;
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

  .nav-item:hover {
    background: #2a2a4e;
    color: #ffffff;
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
