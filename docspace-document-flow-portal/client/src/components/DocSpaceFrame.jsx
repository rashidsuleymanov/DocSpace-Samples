export default function DocSpaceFrame({ roomUrl }) {
  return (
    <div className="docspace-card">
      <h3>DocSpace preview</h3>
      <p className="muted">Embed the DocSpace room manager here.</p>
      <div className="docspace-frame">
        <div className="docspace-placeholder">
          <p>Frame source: {roomUrl}</p>
          <span>DocSpace SDK integration goes here.</span>
        </div>
      </div>
    </div>
  );
}
