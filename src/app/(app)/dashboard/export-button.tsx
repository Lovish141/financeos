"use client";

/** Design's "Export PDF" ghost button — prints the current dashboard view. */
export function ExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 transition-colors"
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        border: "1px solid oklch(0.91 0.004 250)",
        background: "#fff",
        fontSize: "13.5px",
        fontWeight: 600,
        color: "oklch(0.3 0.01 260)",
        cursor: "pointer",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      Export PDF
    </button>
  );
}
