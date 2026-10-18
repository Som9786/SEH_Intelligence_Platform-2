// Mermaid is large, so it is loaded on first use and configured once. Per-diagram settings (theme,
// layout) belong in the diagram's own %%{init}%% directive so diagrams never share global state.
let ready: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  ready ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'default',
      fontFamily: 'Arial, sans-serif',
    });
    return mermaid;
  });
  return ready;
}

/** Renders Mermaid source to SVG markup. `id` must be unique in the document and start with a letter. */
export async function renderMermaid(
  id: string,
  source: string,
): Promise<string> {
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(id, source);
  return svg;
}
