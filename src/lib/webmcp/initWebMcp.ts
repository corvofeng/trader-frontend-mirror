import '@mcp-b/global';

/**
 * Global WebMCP compatibility initializer.
 * Ensures modelContext is accessible across document.modelContext, window.modelContext,
 * and navigator.modelContext for all AI browser agents and extensions.
 */
function setupWebMcpGlobals() {
  if (typeof window === 'undefined') return;

  try {
    // Alias window.modelContext to document.modelContext / navigator.modelContext
    if (!('modelContext' in window)) {
      Object.defineProperty(window, 'modelContext', {
        configurable: true,
        enumerable: true,
        get() {
          return (typeof document !== 'undefined' ? (document as unknown as { modelContext?: unknown }).modelContext : null) ||
            (window.navigator as unknown as { modelContext?: unknown })?.modelContext ||
            null;
        },
      });
    }

    // Ensure document.modelContext is mirrored to window.modelContext if document exists
    if (typeof document !== 'undefined' && (document as unknown as { modelContext?: unknown }).modelContext) {
      const mc = (document as unknown as { modelContext: unknown }).modelContext;
      if (!(window as unknown as { modelContext?: unknown }).modelContext) {
        try {
          (window as unknown as { modelContext: unknown }).modelContext = mc;
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('[WebMCP] setupWebMcpGlobals error:', err);
  }
}

setupWebMcpGlobals();

export { setupWebMcpGlobals };
