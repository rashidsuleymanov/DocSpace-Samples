export default function Topbar({ room }) {
  const name = room?.name || room?.title || "Room not linked yet";
  const url = room?.url || room?.webUrl || "";
  return (
    <header className="topbar">
      <div>
        <h2>Citizen workspace</h2>
        <p className="muted">Room: {name}</p>
      </div>
    </header>
  );
}
