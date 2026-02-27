<script lang="ts">
  // Project list page (start page)
  // TODO: Implement full project list in Phase 8b

  let projectName = $state('');
</script>

<main>
  <header>
    <h1>WLAN-Optimizer</h1>
    <p>WLAN planning and optimization tool for home networks</p>
  </header>

  <section>
    <h2>Projects</h2>
    <p>No projects yet. Create your first project to get started.</p>

    <form>
      <input
        type="text"
        bind:value={projectName}
        placeholder="Project name"
      />
      <button type="submit" disabled={!projectName.trim()}>
        Create Project
      </button>
    </form>
  </section>
</main>

<style>
  main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: system-ui, -apple-system, sans-serif;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
  }

  section {
    margin-top: 2rem;
  }

  form {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
