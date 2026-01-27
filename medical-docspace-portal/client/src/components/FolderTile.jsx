export default function FolderTile({ title, description, count, icon = "folder", onClick }) {
  return (
    <button className="folder-tile" type="button" onClick={onClick}>
      <div className="folder-icon" aria-hidden="true">
        {renderIcon(icon)}
      </div>
      <div>
        <h4>{title}</h4>
        <p className="muted">{description}</p>
      </div>
      <span className="pill">{count} items</span>
    </button>
  );
}

function renderIcon(name) {
  switch (name) {
    case "id":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M6 7.5A2.5 2.5 0 1 1 11 7.5 2.5 2.5 0 0 1 6 7.5Zm-2.5 8.5a4.5 4.5 0 0 1 9 0v.5H3.5v-.5Zm10-9h7M13.5 11h7M13.5 15h5" />
          <rect x="2.5" y="4" width="19" height="16" rx="2" />
        </svg>
      );
    case "contract":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5M8 12h8M8 16h6" />
        </svg>
      );
    case "lab":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M9 3h6M10 3v6l-5 8a4 4 0 0 0 3.4 6h7.2a4 4 0 0 0 3.4-6l-5-8V3" />
          <path d="M8 14h8" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 9h18" />
          <path d="M7 13h4M13 13h4M7 17h4" />
        </svg>
      );
    case "note":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5M8 13h8M8 17h6" />
          <path d="M9 11h2" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M12 3 19 6v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "pill":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M7 17a4 4 0 0 1 0-6l4-4a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0Z" />
          <path d="M9 9l6 6" />
        </svg>
      );
    case "scan":
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M7 3h4M13 3h4M7 21h4M13 21h4" />
          <path d="M8 10h8M8 14h6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        </svg>
      );
  }
}
