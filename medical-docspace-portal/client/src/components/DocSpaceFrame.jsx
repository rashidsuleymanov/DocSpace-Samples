export default function DocSpaceFrame({ roomUrl }) {
  return (
    <div className="docspace-card">
      <h3>Workspace preview</h3>
      <p className="muted">Embed the workspace room manager here.</p>
      <div className="docspace-frame">
        <div className="docspace-placeholder">
          <p>Frame source: {roomUrl}</p>
          <span>Workspace SDK integration goes here.</span>
        </div>
      </div>
    </div>
  );
}
