export default function Topbar({ room }) {
  const name = room?.name || room?.title || "Workspace not linked yet";
  return (
    <header className="topbar">
      <div>
        <h2>Client workspace</h2>
        <p className="muted">Room: {name}</p>
      </div>
    </header>
  );
}
