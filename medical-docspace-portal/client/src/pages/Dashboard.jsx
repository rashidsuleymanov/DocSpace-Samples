import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import FolderTile from "../components/FolderTile.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import folderStructure from "../data/folderStructure.js";
import { createFileShareLink } from "../services/docspaceApi.js";

const appointmentsStorageKey = "medical.portal.appointments";

export default function Dashboard({ session, onLogout, onNavigate }) {
  const [folderStats, setFolderStats] = useState(folderStructure);
  const [summaryError, setSummaryError] = useState("");
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderContents, setFolderContents] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [shareModal, setShareModal] = useState({ open: false, title: "", link: "", loading: false, error: "" });

  useEffect(() => {
    if (!session?.room?.id || session.room.id === "DOCSPACE") return;
    const load = async () => {
      try {
        const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
        const response = await fetch(`/api/patients/room-summary?roomId=${session.room.id}`, {
          headers
        });
        const data = await response.json();
        if (!response.ok) {
          const details =
            typeof data?.error === "string" ? data.error : JSON.stringify(data?.error || {});
          throw new Error(details || "Failed to load room summary");
        }
        const mapped = mapFoldersFromSummary(folderStructure, data.summary || []);
        const withAppointments = applyAppointmentsCount(mapped);
        setFolderStats(withAppointments);
        setSummaryError("");
      } catch (error) {
        setSummaryError(error.message || "Failed to load room summary");
      }
    };
    load();
  }, [session]);

  const openFolder = async (folder) => {
    if (!folder?.id) return;
    setActiveFolder(folder);
    setFolderContents([]);
    setFolderLoading(true);
    try {
      const contents = await fetchFolderContents(folder.id, session?.user?.token);
      const nextItems = filterFolderItems(folder, contents.items || []);
      setFolderContents(nextItems);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleShareFile = async (item) => {
    if (!item?.id) return;
    setShareModal({ open: true, title: item.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId: item.id, token: session?.user?.token });
      setShareModal({ open: true, title: item.title, link: link?.shareLink || "", loading: false, error: "" });
    } catch (error) {
      setShareModal({ open: true, title: item.title, link: "", loading: false, error: typeof error?.message === "string" ? error.message : JSON.stringify(error?.message || error || "", null, 2) });
    }
  };


  return (
    <div className="dashboard-layout">
      <Sidebar user={session.user} onLogout={onLogout} active="dashboard" onNavigate={onNavigate} />
      <main>
        <Topbar room={session.room} />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Patient room structure</h3>
              <p className="muted">
                {activeFolder
                  ? `Viewing: ${activeFolder.title}`
                  : "Folders are created automatically after registration."}
              </p>
            </div>
            {activeFolder ? (
              <button className="secondary" onClick={() => setActiveFolder(null)}>
                Back to folders
              </button>
            ) : (
              <button className="secondary">Request new folder</button>
            )}
          </div>
          {session?.warnings?.length ? (
            <p className="muted">Warnings: {session.warnings.join("; ")}</p>
          ) : null}
          {!session?.room?.id && (
            <p className="muted">Room is not linked to this account yet.</p>
          )}
          {summaryError && <p className="muted">Summary error: {summaryError}</p>}
          {!activeFolder ? (
            <div className="folder-grid">
              {folderStats.map((folder) => {
                const { key: folderKey, ...rest } = folder;
                return (
                  <FolderTile
                    key={folder.id || folderKey || folder.title}
                    {...rest}
                    onClick={() => openFolder(folder)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="folder-contents">
              {folderLoading && <p className="muted">Loading folder contents...</p>}
              {!folderLoading && folderContents.length === 0 && (
                <p className="muted">No items in this folder yet.</p>
              )}
              <ul className="content-list">
                {folderContents.map((item) => (
                  <li
                    key={`${item.type}-${item.id}`}
                    className={`content-item ${item.type}`}
                    onClick={() => {
                      if (item.type === "file" && item.openUrl) {
                        window.open(item.openUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <span className="content-icon" />
                    <span className="content-title">{item.title}</span>
                    {item.type === "file" && (
                      <button
                        className="secondary share-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShareFile(item);
                        }}
                      >
                        Share QR
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <ShareQrModal
          open={shareModal.open}
          title={shareModal.title}
          link={shareModal.link}
          loading={shareModal.loading}
          error={shareModal.error}
          onClose={() => setShareModal({ open: false, title: "", link: "", loading: false, error: "" })}
        />
      </main>
    </div>
  );
}

function mapFoldersFromSummary(base, summary) {
  const descriptionMap = new Map(base.map((item) => [normalize(item.title), item.description]));
  const iconMap = new Map(base.map((item) => [normalize(item.title), item.icon]));

  return summary.map((folder) => {
    const count = (folder.filesCount ?? 0) + (folder.foldersCount ?? 0);
    return {
      id: folder.id,
      title: folder.title,
      description: descriptionMap.get(normalize(folder.title)) || "Patient documents",
      icon: iconMap.get(normalize(folder.title)) || "folder",
      count
    };
  });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchFolderContents(folderId, token) {
  const headers = token ? { Authorization: token } : undefined;
  const response = await fetch(`/api/patients/folder-contents?folderId=${folderId}`, {
    headers
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load folder contents");
  }
  return data.contents;
}

function applyAppointmentsCount(folders) {
  const activeCount = getActiveAppointmentsCount();
  return folders.map((folder) =>
    normalize(folder.title) === "appointments" ? { ...folder, count: activeCount } : folder
  );
}

function getActiveAppointmentsCount() {
  try {
    const raw = localStorage.getItem(appointmentsStorageKey);
    const items = raw ? JSON.parse(raw) : [];
    return items.filter((item) => item?.status === "Scheduled").length;
  } catch {
    return 0;
  }
}


function filterFolderItems(folder, items) {
  if (normalize(folder?.title) !== "appointments") return items;
  const activeTicketIds = getActiveAppointmentTicketIds();
  if (activeTicketIds.size === 0) return [];
  return items.filter((item) => item?.type !== "file" || activeTicketIds.has(String(item.id)));
}

function getActiveAppointmentTicketIds() {
  try {
    const raw = localStorage.getItem(appointmentsStorageKey);
    const items = raw ? JSON.parse(raw) : [];
    const ids = items
      .filter((item) => item?.status === "Scheduled" && item?.ticket?.id)
      .map((item) => String(item.ticket.id));
    return new Set(ids);
  } catch {
    return new Set();
  }
}

