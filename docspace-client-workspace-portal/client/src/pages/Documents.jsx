import { useEffect, useMemo, useState } from "react";
import FolderTile from "../components/FolderTile.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import UploadModal from "../components/UploadModal.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
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
    key: "shared-documents",
    title: "Shared Documents",
    description: "2-way file exchange.",
    icon: "contract"
  },
  {
    key: "projects",
    title: "Projects",
    description: "Structured deal packages.",
    icon: "stack"
  }
];

export default function Documents({ session, actor, credentialsUrl, onNavigate }) {
  const [folderStats, setFolderStats] = useState(defaultFolders);
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderContents, setFolderContents] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [projectsCount, setProjectsCount] = useState(0);
  const [requests, setRequests] = useState([]);
  const [summaryError, setSummaryError] = useState("");
  const [shareModal, setShareModal] = useState({
    open: false,
    title: "",
    link: "",
    loading: false,
    error: ""
  });
  const [uploadModal, setUploadModal] = useState({
    open: false,
    title: "",
    targetFolderId: "",
    sourceFolderId: ""
  });
  const [requestUploadModal, setRequestUploadModal] = useState({
    open: false,
    requestId: "",
    requiredKey: "",
    targetFolderId: "",
    sourceFolderId: ""
  });
  const [docModal, setDocModal] = useState({
    open: false,
    title: "",
    url: "",
    fileId: ""
  });

  useEffect(() => {
    if (!session?.room?.id || !actor?.user?.token) return;
    const load = async () => {
      try {
        const [summary, projects, actionItems] = await Promise.all([
          getRoomSummary({ roomId: session.room.id, token: actor.user.token }),
          listApplications({ roomId: session.room.id }),
          listRequests({ roomId: session.room.id })
        ]);
        setFolderStats(mapFoldersFromSummary(defaultFolders, summary || []));
        setProjectsCount((projects || []).length);
        setRequests(actionItems || []);
        setSummaryError("");
      } catch (error) {
        setSummaryError(error?.message || "Failed to load workspace summary");
      }
    };
    load();
  }, [session?.room?.id, actor?.user?.token]);

  const sourceFolderId = useMemo(() => {
    const folder = folderStats.find((item) => normalize(item.title) === "shared documents");
    return folder?.id || "";
  }, [folderStats]);

  const actionItemsFolderId = useMemo(() => {
    const folder = folderStats.find((item) => normalize(item.title) === "action items");
    return folder?.id || "";
  }, [folderStats]);

  const openFolder = async (folder) => {
    if (!folder?.id) return;
    if (normalize(folder.title) === "projects") {
      onNavigate?.("projects");
      return;
    }
    setActiveFolder(folder);
    setFolderLoading(true);
    setFolderContents([]);
    try {
      const contents = await getFolderContents({
        folderId: folder.id,
        token: actor?.user?.token
      });
      setFolderContents(contents.items || []);
    } catch (error) {
      setSummaryError(error?.message || "Failed to load folder contents");
    } finally {
      setFolderLoading(false);
    }
  };

  const respondToRequest = (request) => {
    const nextRequired = (request?.requiredDocuments || []).find(
      (doc) => (request.uploads?.[doc] || []).length === 0
    );
    if (!nextRequired) return;
    setRequestUploadModal({
      open: true,
      requestId: request.id,
      requiredKey: nextRequired,
      targetFolderId: request.folder?.id || actionItemsFolderId,
      sourceFolderId
    });
  };

  const openDocument = (item) => {
    if (!item?.id && !item?.openUrl) return;
    setDocModal({
      open: true,
      title: item.title || "Document",
      url: item.openUrl || "",
      fileId: item.id || ""
    });
  };

  const handleShareFile = async (item) => {
    if (!item?.id) return;
    setShareModal({ open: true, title: item.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId: item.id, token: actor?.user?.token });
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

  const openRequests = requests.filter((item) => item.status !== "Completed");
  const openRequestsCount = openRequests.length;
  const summaryHint = activeFolder ? `Browsing ${activeFolder.title}` : "Open a section to continue.";

  return (
    <>
      <section className="content-panel workspace-summary-panel">
        <div className="workspace-summary">
          <div>
            <h2>{session?.room?.title || "Client Workspace"}</h2>
            <p className="muted">{openRequestsCount ? `${openRequestsCount} item needs attention` : "Everything is up to date."}</p>
          </div>
          <div className="workspace-summary__meta">
            <span className="summary-pill">{openRequestsCount} open requests</span>
          </div>
          <div className="workspace-summary__actions">
            <button
              className="primary"
              type="button"
              onClick={() => {
                if (openRequests[0]) {
                  respondToRequest(openRequests[0]);
                } else {
                  onNavigate?.("projects");
                }
              }}
            >
              {openRequests[0] ? "Respond now" : "Open projects"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => session?.room?.url && window.open(session.room.url, "_blank", "noopener,noreferrer")}
            >
              Open in DocSpace
            </button>
          </div>
        </div>
      </section>

      {openRequests.length > 0 ? (
        <section className="content-panel">
          <div className="panel-head">
            <div>
              <h3>Needs Attention</h3>
              <p className="muted">Complete the current request from the manager.</p>
            </div>
          </div>

          <div className="attention-list">
            {openRequests.map((request) => (
              <article key={request.id} className="attention-card">
                <div className="attention-card__main">
                  <div className="attention-card__top">
                    <div className="attention-card__title">
                      <strong>{request.title}</strong>
                      <span className="muted small">
                        {request.periodFrom || "Open"} to {request.periodTo || "Flexible"}
                      </span>
                    </div>
                    <span className={`status-chip ${request.status === "Completed" ? "success" : ""}`}>
                      {request.status}
                    </span>
                  </div>

                  <div className="attention-checklist">
                    {(request.requiredDocuments || []).map((doc) => {
                      const done = (request.uploads?.[doc] || []).length > 0;
                      return (
                        <div key={doc} className={`attention-checklist__item${done ? " is-done" : ""}`}>
                          <span className="attention-checklist__dot" aria-hidden="true" />
                          <span>{doc}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="attention-card__actions">
                  <button className="primary" type="button" onClick={() => respondToRequest(request)}>
                    Respond
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="content-panel">
        <div className="panel-head">
          <div>
            <h3>{activeFolder ? activeFolder.title : "Workspace"}</h3>
            <p className="muted">{summaryHint}</p>
          </div>
          {activeFolder ? (
            <div className="panel-actions">
              {normalize(activeFolder.title) === "shared documents" ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    setUploadModal({
                      open: true,
                      title: "Add file to Shared Documents",
                      targetFolderId: activeFolder.id,
                      sourceFolderId
                    })
                  }
                >
                  Add file
                </button>
              ) : null}
              <button className="ghost" type="button" onClick={() => setActiveFolder(null)}>
                Back to overview
              </button>
            </div>
          ) : null}
        </div>

        {summaryError ? <p className="muted">Error: {summaryError}</p> : null}

        {!activeFolder ? (
          <div className="folder-grid">
            {folderStats.map((folder) => (
              <FolderTile
                key={folder.id || folder.key}
                title={folder.title}
                description={folder.description}
                icon={folder.icon}
                count={normalize(folder.title) === "projects" ? projectsCount : folder.count}
                onClick={() => openFolder(folder)}
              />
            ))}
          </div>
        ) : (
          <div className="folder-contents">
            {folderLoading ? <p className="muted">Loading folder contents...</p> : null}
            {!folderLoading && folderContents.length === 0 ? (
              <p className="muted">No files in this section yet.</p>
            ) : null}
            <ul className="content-list">
              {folderContents.map((item) => (
                <li
                  key={`${item.type}-${item.id}`}
                  className={`content-item ${item.type}`}
                  onClick={() => item.type === "file" && openDocument(item)}
                >
                  <span className="content-icon" />
                  <span className="content-title">{item.title}</span>
                  {item.type === "file" ? (
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
                  ) : (
                    <span className="muted small">Folder</span>
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

      <UploadModal
        open={uploadModal.open}
        title={uploadModal.title}
        targetFolderId={uploadModal.targetFolderId}
        sourceFolderId={uploadModal.sourceFolderId}
        token={actor?.user?.token}
        onClose={() => setUploadModal({ open: false, title: "", targetFolderId: "", sourceFolderId: "" })}
        onUploadLocal={async (file) => {
          await uploadLocalToFolder({ folderId: uploadModal.targetFolderId, fileName: file.name });
          if (activeFolder?.id) {
            const contents = await getFolderContents({
              folderId: activeFolder.id,
              token: actor?.user?.token
            });
            setFolderContents(contents.items || []);
          }
        }}
        onUploadCopy={async (fileId) => {
          await copyFileToFolder({ fileId, destFolderId: uploadModal.targetFolderId });
          if (activeFolder?.id) {
            const contents = await getFolderContents({
              folderId: activeFolder.id,
              token: actor?.user?.token
            });
            setFolderContents(contents.items || []);
          }
        }}
      />

      <UploadModal
        open={requestUploadModal.open}
        title={requestUploadModal.requiredKey ? `Respond: ${requestUploadModal.requiredKey}` : "Respond"}
        targetFolderId={requestUploadModal.targetFolderId}
        sourceFolderId={requestUploadModal.sourceFolderId}
        token={actor?.user?.token}
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
            setRequests((items) => items.map((item) => (item.id === result.request.id ? result.request : item)));
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
            setRequests((items) => items.map((item) => (item.id === result.request.id ? result.request : item)));
          }
        }}
      />

      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        fileId={docModal.fileId}
        token={actor?.user?.token}
        credentialsUrl={credentialsUrl}
        onClose={() => setDocModal({ open: false, title: "", url: "", fileId: "" })}
      />
    </>
  );
}

function mapFoldersFromSummary(base, summary) {
  const descriptionMap = new Map(base.map((item) => [normalize(item.title), item.description]));
  const iconMap = new Map(base.map((item) => [normalize(item.title), item.icon]));

  return summary
    .filter((folder) => descriptionMap.has(normalize(folder.title)))
    .map((folder) => ({
      id: folder.id,
      title: folder.title,
      description: descriptionMap.get(normalize(folder.title)) || "Workspace documents",
      icon: iconMap.get(normalize(folder.title)) || "folder",
      count: (folder.filesCount ?? 0) + (folder.foldersCount ?? 0)
    }));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
