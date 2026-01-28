import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import FolderTile from "../components/FolderTile.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import UploadModal from "../components/UploadModal.jsx";
import {
  copyFileToFolder,
  createFileShareLink,
  getFolderContents,
  getRoomSummary,
  listApplications,
  listRequests,
  uploadCopyRequestFile,
  uploadLocalRequestFile,
  uploadLocalToFolder
} from "../services/docspaceApi.js";

const defaultFolders = [
  {
    key: "my-documents",
    title: "My Documents",
    description: "Documents received from public services and your uploads.",
    icon: "folder"
  },
  {
    key: "requests-inbox",
    title: "Requests Inbox",
    description: "Incoming requests and missing document notifications.",
    icon: "inbox"
  },
  {
    key: "applications",
    title: "Applications",
    description: "Folders created for each application you submit.",
    icon: "stack"
  }
];

export default function Documents({ session, onLogout, onNavigate }) {
  const [folderStats, setFolderStats] = useState(defaultFolders);
  const [summaryError, setSummaryError] = useState("");
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderContents, setFolderContents] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [shareModal, setShareModal] = useState({
    open: false,
    title: "",
    link: "",
    loading: false,
    error: ""
  });
  const [requests, setRequests] = useState([]);
  const [requestUploadModal, setRequestUploadModal] = useState({
    open: false,
    requestId: "",
    requiredKey: "",
    targetFolderId: "",
    sourceFolderId: ""
  });
  const [uploadModal, setUploadModal] = useState({
    open: false,
    title: "",
    targetFolderId: "",
    sourceFolderId: ""
  });

  useEffect(() => {
    if (!session?.room?.id || session.room.id === "DOCSPACE") return;
    const load = async () => {
      try {
        const [summary, apps, reqs] = await Promise.all([
          getRoomSummary({
            roomId: session.room.id,
            token: session?.user?.token
          }),
          listApplications({ roomId: session.room.id }),
          listRequests({ roomId: session.room.id })
        ]);
        const mapped = mapFoldersFromSummary(defaultFolders, summary || []);
        setFolderStats(mapped);
        setApplicationsCount((apps || []).length);
        setRequests(reqs || []);
        setSummaryError("");
      } catch (error) {
        setSummaryError(error.message || "Failed to load room summary");
      }
    };
    load();
  }, [session]);

  const openFolder = async (folder) => {
    if (!folder?.id) return;
    if (normalize(folder?.title) === "applications") {
      onNavigate?.("applications");
      return;
    }
    setActiveFolder(folder);
    setFolderContents([]);
    setFolderLoading(true);
    try {
      const contents = await getFolderContents({
        folderId: folder.id,
        token: session?.user?.token
      });
      setFolderContents(contents.items || []);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleShareFile = async (item) => {
    if (!item?.id) return;
    setShareModal({ open: true, title: item.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId: item.id, token: session?.user?.token });
      setShareModal({
        open: true,
        title: item.title,
        link: link?.shareLink || "",
        loading: false,
        error: ""
      });
    } catch (error) {
      setShareModal({
        open: true,
        title: item.title,
        link: "",
        loading: false,
        error: error?.message || "Failed to create share link"
      });
    }
  };

  const summaryHint = useMemo(() => {
    if (!session?.room?.id) return "Room is not linked to this account yet.";
    if (activeFolder) return `Viewing: ${activeFolder.title}`;
    return "Folders are created automatically after registration.";
  }, [activeFolder, session]);

  const sourceFolderId = useMemo(() => {
    const inbox = folderStats.find((item) => normalize(item.title) === "requests inbox");
    return inbox?.id || "";
  }, [folderStats]);

  const myDocumentsFolderId = useMemo(() => {
    const myDocs = folderStats.find((item) => normalize(item.title) === "my documents");
    return myDocs?.id || "";
  }, [folderStats]);

  return (
    <div className="dashboard-layout">
      <Sidebar user={session.user} onLogout={onLogout} active="documents" onNavigate={onNavigate} />
      <main>
        <Topbar room={session.room} />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>My documents</h3>
              <p className="muted">{summaryHint}</p>
            </div>
            {activeFolder ? (
              <div className="panel-actions">
                {normalize(activeFolder?.title) === "my documents" && (
                  <button
                    className="secondary"
                    onClick={() =>
                      setUploadModal({
                        open: true,
                        title: "Upload to My Documents",
                        targetFolderId: activeFolder.id,
                        sourceFolderId
                      })
                    }
                  >
                    Upload
                  </button>
                )}
                <button className="secondary" onClick={() => setActiveFolder(null)}>
                  Back to folders
                </button>
              </div>
            ) : (
              <button className="secondary" onClick={() => onNavigate?.("applications")}>
                New application
              </button>
            )}
          </div>
          {session?.warnings?.length ? (
            <p className="muted">Warnings: {session.warnings.join("; ")}</p>
          ) : null}
          {summaryError && <p className="muted">Summary error: {summaryError}</p>}
          {!activeFolder ? (
            <div className="folder-grid">
              {folderStats.map((folder) => {
                const { key: folderKey, ...rest } = folder;
                const isApplications = normalize(rest.title) === "applications";
                return (
                  <FolderTile
                    key={folder.id || folderKey || folder.title}
                    {...rest}
                    count={isApplications ? applicationsCount : rest.count}
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
                        onClick={(event) => {
                          event.stopPropagation();
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
          onClose={() =>
            setShareModal({ open: false, title: "", link: "", loading: false, error: "" })
          }
        />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Requests</h3>
              <p className="muted">Public service requests that need your response.</p>
            </div>
          </div>
          {requests.length === 0 && <p className="muted">No active requests.</p>}
          <div className="application-grid">
            {requests.map((request) => (
              <div key={request.id} className="application-card">
                <div className="application-card-head">
                  <strong>{request.title}</strong>
                  <span className={`status-chip ${request.status === "Completed" ? "success" : ""}`}>
                    {request.status}
                  </span>
                </div>
                <span className="muted small">
                  {request.periodFrom || "—"} → {request.periodTo || "—"}
                </span>
                <div className="checklist">
                  {(request.requiredDocuments || []).map((doc) => {
                    const uploads = request.uploads?.[doc] || [];
                    const uploaded = uploads.length > 0;
                    return (
                      <div key={doc} className="upload-row">
                        <span>{doc}</span>
                        <button
                          className={`secondary ${uploaded ? "uploaded" : ""}`}
                          type="button"
                          disabled={uploaded}
                          onClick={() =>
                            setRequestUploadModal({
                              open: true,
                              requestId: request.id,
                              requiredKey: doc,
                              targetFolderId: request.folder?.id || sourceFolderId,
                              sourceFolderId: myDocumentsFolderId || sourceFolderId
                            })
                          }
                        >
                          {uploaded ? "Uploaded" : "Upload"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
        <UploadModal
          open={uploadModal.open}
          title={uploadModal.title}
          targetFolderId={uploadModal.targetFolderId}
          sourceFolderId={uploadModal.sourceFolderId}
          token={session?.user?.token}
          onClose={() =>
            setUploadModal({ open: false, title: "", targetFolderId: "", sourceFolderId: "" })
          }
          onUploadLocal={async (file) => {
            await uploadLocalToFolder({ folderId: uploadModal.targetFolderId, fileName: file.name });
            if (activeFolder?.id) {
              const contents = await getFolderContents({
                folderId: activeFolder.id,
                token: session?.user?.token
              });
              setFolderContents(contents.items || []);
            }
          }}
          onUploadCopy={async (fileId) => {
            await copyFileToFolder({
              fileId,
              destFolderId: uploadModal.targetFolderId
            });
            if (activeFolder?.id) {
              const contents = await getFolderContents({
                folderId: activeFolder.id,
                token: session?.user?.token
              });
              setFolderContents(contents.items || []);
            }
          }}
        />
        <UploadModal
          open={requestUploadModal.open}
          title={requestUploadModal.requiredKey ? `Upload: ${requestUploadModal.requiredKey}` : "Upload"}
          targetFolderId={requestUploadModal.targetFolderId}
          sourceFolderId={requestUploadModal.sourceFolderId}
          token={session?.user?.token}
          onClose={() =>
            setRequestUploadModal({
              open: false,
              requestId: "",
              requiredKey: "",
              targetFolderId: "",
              sourceFolderId: ""
            })
          }
          onUploadLocal={async (file) => {
            const result = await uploadLocalRequestFile({
              requestId: requestUploadModal.requestId,
              folderId: requestUploadModal.targetFolderId,
              fileName: file.name,
              requiredKey: requestUploadModal.requiredKey
            });
            if (result?.request) {
              setRequests((items) =>
                items.map((item) => (item.id === result.request.id ? result.request : item))
              );
            }
          }}
          onUploadCopy={async (fileId) => {
            const result = await uploadCopyRequestFile({
              requestId: requestUploadModal.requestId,
              fileId,
              destFolderId: requestUploadModal.targetFolderId,
              requiredKey: requestUploadModal.requiredKey
            });
            if (result?.request) {
              setRequests((items) =>
                items.map((item) => (item.id === result.request.id ? result.request : item))
              );
            }
          }}
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
      description: descriptionMap.get(normalize(folder.title)) || "Room documents",
      icon: iconMap.get(normalize(folder.title)) || "folder",
      count
    };
  });
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
