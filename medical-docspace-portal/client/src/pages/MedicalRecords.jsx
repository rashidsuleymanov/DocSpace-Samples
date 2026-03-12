import { useEffect, useRef, useState } from "react";

import PatientShell from "../components/PatientShell.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import FolderTile from "../components/FolderTile.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import folderStructure from "../data/folderStructure.js";
import { createFileShareLink } from "../services/docspaceApi.js";

function isErrorText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /(failed|error|missing|not set|not created|not available|refused)/i.test(text);
}

const appointmentsStorageKey = "medical.portal.appointments";
const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const insuranceEditorFrameId = "insurance-request-editor-hidden";

let sdkLoaderPromise = null;

function withFillAction(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set("action", "fill");
    return parsed.toString();
  } catch {
    return raw.includes("?") ? `${raw}&action=fill` : `${raw}?action=fill`;
  }
}

function withEditAction(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set("action", "edit");
    return parsed.toString();
  } catch {
    return raw.includes("?") ? `${raw}&action=edit` : `${raw}?action=edit`;
  }
}

function loadDocSpaceSdk(src) {
  if (sdkLoaderPromise) return sdkLoaderPromise;
  sdkLoaderPromise = new Promise((resolve, reject) => {
    if (window.DocSpace?.SDK) {
      resolve(window.DocSpace.SDK);
      return;
    }
    if (!src) {
      reject(new Error("Workspace URL is missing"));
      return;
    }
    const script = document.createElement("script");
    script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load editor SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

export default function MedicalRecords({
  session,
  onLogout,
  onNavigate,
  roleSwitcher,
  initialFolderTitle,
  onInitialFolderOpened
}) {
  const [shareModal, setShareModal] = useState({
    open: false,
    title: "",
    link: "",
    loading: false,
    error: ""
  });
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });

  const [folderStats, setFolderStats] = useState(folderStructure);
  const [summaryError, setSummaryError] = useState("");
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderContents, setFolderContents] = useState([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const autoOpenedRef = useRef("");
  const editorRef = useRef(null);
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  const [insuranceBusy, setInsuranceBusy] = useState(false);
  const [insuranceMessage, setInsuranceMessage] = useState("");
  const [insuranceForm, setInsuranceForm] = useState({
    provider: "",
    policyNumber: "",
    validTo: "",
    note: ""
  });

  const openRecord = (item) => {
    if (!item) return;
    const title = String(item?.title || "");
    const isImage = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(title);
    if (isImage && item?.id) {
      createFileShareLink({ fileId: item.id })
        .then((link) => {
          const url = link?.shareLink || link?.shareUrl || link?.url || item.openUrl || "";
          if (!url) return;
          setDocModal({ open: true, title: title || "Imaging", url });
        })
        .catch(() => {
          if (!item?.openUrl) return;
          setDocModal({ open: true, title: title || "Imaging", url: item.openUrl });
        });
      return;
    }

    if (!item?.openUrl) return;
    setDocModal({ open: true, title: title || "Medical record", url: item.openUrl });
  };

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  useEffect(() => {
    const ids = [insuranceEditorFrameId];
    const hosts = ids.map((id) => {
      let host = document.getElementById(id);
      if (!host) {
        host = document.createElement("div");
        host.id = id;
        host.className = "hidden-editor";
        document.body.appendChild(host);
      }
      return host;
    });
    return () => {
      destroyEditor();
      for (const host of hosts) {
        if (host?.parentNode) host.parentNode.removeChild(host);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillInsuranceRequestHidden = async (file, payload) => {
    if (!file?.id) return;
    if (!docspaceUrl) throw new Error("VITE_DOCSPACE_URL is not set.");
    const token = file?.shareToken || session?.user?.token || "";
    if (!token) throw new Error("Access token is missing.");

    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);

    await new Promise((resolve, reject) => {
      const instance = window.DocSpace?.SDK?.initEditor({
        src: docspaceUrl,
        id: String(file.id),
        frameId: insuranceEditorFrameId,
        requestToken: token,
        width: "1px",
        height: "1px",
        events: {
          onAppReady: () => {
            const frameInstance = window.DocSpace?.SDK?.frames?.[insuranceEditorFrameId];
            if (!frameInstance) {
              destroyEditor();
              reject(new Error("Editor frame is not available."));
              return;
            }

            const templateData = payload || {};

            const editorCallback = new Function(
              "editorInstance",
              `
              try {
                if (!editorInstance || typeof editorInstance.createConnector !== "function") return;
                const connector = editorInstance.createConnector();
                if (!connector || typeof connector.callCommand !== "function") return;

                Asc.scope.data = ${JSON.stringify(templateData)};

                connector.callCommand(function () {
                  try {
                    var d = Asc.scope.data || {};
                    var patient = d.patient || {};
                    var insurance = d.insurance || {};

                    function safeText(v) {
                      return (v && String(v).trim()) ? String(v) : "-";
                    }

                    var doc = Api.GetDocument();
                    if (doc.RemoveAllElements) doc.RemoveAllElements();

                    var textPr = doc.GetDefaultTextPr();
                    textPr.SetFontFamily("Calibri");
                    textPr.SetLanguage("en-US");

                    function pushPara(p) {
                      if (doc.Push) doc.Push(p);
                      else doc.InsertContent([p]);
                    }

                    function addTitle(text) {
                      var p = Api.CreateParagraph();
                      p.SetJc("center");
                      var r = p.AddText(text);
                      r.SetBold(true);
                      r.SetFontSize(34);
                      r.SetColor(0x29, 0x33, 0x4F, false);
                      pushPara(p);
                    }

                    function addSubtitle(text) {
                      var p = Api.CreateParagraph();
                      p.SetJc("center");
                      var r = p.AddText(text);
                      r.SetItalic(true);
                      r.SetFontSize(18);
                      r.SetColor(0x55, 0x55, 0x55, false);
                      pushPara(p);
                    }

                    function addSection(text) {
                      var p = Api.CreateParagraph();
                      p.SetJc("left");
                      p.SetSpacingBefore(180);
                      var r = p.AddText(text);
                      r.SetBold(true);
                      r.SetFontSize(22);
                      r.SetColor(0x29, 0x33, 0x4F, false);
                      pushPara(p);
                    }

                    function addField(label, value) {
                      var p = Api.CreateParagraph();
                      p.SetJc("left");
                      p.SetSpacingAfter(80);
                      var r1 = p.AddText(label + ": ");
                      r1.SetBold(true);
                      var r2 = p.AddText(safeText(value));
                      r2.SetBold(false);
                      pushPara(p);
                    }

                    addTitle("INSURANCE UPDATE REQUEST");
                    addSubtitle("Please update my insurance details in the clinic records.");

                    addSection("Patient");
                    addField("Name", patient.fullName);
                    addField("Email", patient.email);
                    addField("Phone", patient.phone);

                    addSection("Insurance");
                    addField("Provider", insurance.provider);
                    addField("Policy number", insurance.policyNumber);
                    addField("Valid to", insurance.validTo);
                    addField("Note", insurance.note);

                    addSection("Generated");
                    addField("Date", new Date().toISOString().slice(0, 10));

                    Api.Save();
                  } catch (e) {
                    console.error("Error inside callCommand", e);
                  }
                });
              } catch (e) {
                console.error("Editor callback failed", e);
              }
            `
            );

            frameInstance.executeInEditor(editorCallback);
            // Give DocSpace a bit of time to persist the changes before we open the document to the user.
            setTimeout(() => {
              destroyEditor();
              resolve();
            }, 2000);
          },
          onAppError: () => {
            setTimeout(() => destroyEditor(), 1500);
            reject(new Error("DocSpace editor failed to load."));
          }
        }
      });

      editorRef.current = instance;
    });
  };

  async function openFolder(folder) {
    if (!folder?.id) return;
    setActiveFolder(folder);
    setFolderContents([]);
    setFolderLoading(true);
    try {
      const contents = await fetchFolderContents(folder.id);
      const nextItems = filterFolderItems(folder, contents.items || [], session);
      setFolderContents(nextItems);
    } finally {
      setFolderLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.room?.id || session.room.id === "DOCSPACE") return;
    const load = async () => {
      try {
        const response = await fetch(`/api/patients/room-summary?roomId=${session.room.id}`, {
          credentials: "include"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const details =
            typeof data?.error === "string" ? data.error : JSON.stringify(data?.error || {});
          throw new Error(details || "Failed to load room summary");
        }
        const mapped = mapFoldersFromSummary(folderStructure, data.summary || []);
        const withAppointments = applyAppointmentsCount(mapped, session);
        setFolderStats(withAppointments);
        setSummaryError("");
      } catch (loadError) {
        setSummaryError(loadError.message || "Failed to load room summary");
      }
    };
    load();
  }, [session]);

  useEffect(() => {
    const target = normalize(initialFolderTitle);
    if (!target) return;
    if (activeFolder) return;
    if (autoOpenedRef.current === target) return;
    const folder = folderStats.find((f) => normalize(f?.title) === target) || null;
    if (!folder?.id) return;

    autoOpenedRef.current = target;
    openFolder(folder)
      .catch(() => null)
      .finally(() => {
        if (typeof onInitialFolderOpened === "function") onInitialFolderOpened();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFolderTitle, folderStats, activeFolder]);

  const handleShareFile = async (item) => {
    if (!item?.id) return;
    setShareModal({ open: true, title: item.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId: item.id });
      setShareModal({
        open: true,
        title: item.title,
        link: link?.shareLink || "",
        loading: false,
        error: ""
      });
    } catch (err) {
      setShareModal({
        open: true,
        title: item.title,
        link: "",
        loading: false,
        error:
          typeof err?.message === "string"
            ? err.message
            : JSON.stringify(err?.message || err || "", null, 2)
      });
    }
  };

  const isInsuranceFolder = normalize(activeFolder?.title) === "insurance";
  const isContractsFolder = normalize(activeFolder?.title) === "contracts";
  const isSickLeaveFolder = normalize(activeFolder?.title) === "sick leave";
  const isImagingFolder = normalize(activeFolder?.title) === "imaging";

  const generateInsuranceRequest = async () => {
    setInsuranceBusy(true);
    setInsuranceMessage("");
    try {
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");

      const payload = {
        patient: {
          fullName: session?.user?.fullName || "",
          email: session?.user?.email || "",
          phone: session?.user?.phone || ""
        },
        insurance: { ...insuranceForm }
      };

      const response = await fetch("/api/patients/insurance-update-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ roomId, payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Request create failed (${response.status})`);
      }
      const file = data?.file || null;
      if (!file?.id) throw new Error("Failed to create request document");

      await fillInsuranceRequestHidden(file, payload).catch(() => null);
      if (file?.openUrl) {
        setDocModal({
          open: true,
          title: file.title || "Insurance update request",
          url: withFillAction(file.openUrl)
        });
      }
      setInsuranceMessage("Request created in Insurance. Export to PDF in the editor if needed.");
      setInsuranceModalOpen(false);
      setInsuranceForm({ provider: "", policyNumber: "", validTo: "", note: "" });
    } catch (error) {
      setInsuranceMessage(error?.message || "Failed to create insurance request");
    } finally {
      setInsuranceBusy(false);
    }
  };

  return (
    <PatientShell
      user={session.user}
      active="records"
      onNavigate={onNavigate}
      onLogout={onLogout}
      roleSwitcher={roleSwitcher}
      roomId={session?.room?.id}
      token={session?.user?.token}
    >
      <section className="panel documents-panel">
        <div className="panel-head">
          <div>
            <h3>Patient room structure</h3>
            <p className="muted">
              {activeFolder
                ? `Viewing: ${activeFolder.title}`
                : "Folders are created automatically after registration."}
            </p>
          </div>
          {activeFolder && (
            <div className="quick-actions is-end">
              {isInsuranceFolder && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setInsuranceMessage("");
                    setInsuranceModalOpen(true);
                  }}
                >
                  Insurance request
                </button>
              )}
              {isContractsFolder && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    if (typeof onNavigate === "function") {
                      onNavigate({ view: "fill-sign", tab: "templates" });
                    }
                  }}
                >
                  Create statement
                </button>
              )}
              {isSickLeaveFolder && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    if (typeof onNavigate === "function") {
                      onNavigate({ view: "fill-sign", tab: "templates" });
                    }
                  }}
                >
                  Create statement
                </button>
              )}
              {isImagingFolder && (
                null
              )}
              <button className="secondary" type="button" onClick={() => setActiveFolder(null)}>
                Back to folders
              </button>
            </div>
          )}
        </div>

        {session?.warnings?.length ? (
          <p className="muted">Warnings: {session.warnings.join("; ")}</p>
        ) : null}
        {!session?.room?.id && <p className="muted">Room is not linked to this account yet.</p>}
        {summaryError && <p className="muted">Summary error: {summaryError}</p>}

        {!activeFolder ? (
          <div className="folder-grid">
            {folderStats
              .filter((folder) => normalize(folder.title) !== "fill & sign")
              .map((folder) => {
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
	                    if (item.type === "folder" && item.id) {
	                      openFolder(item);
	                      return;
	                    }
	                    if (item.type === "file" && item.openUrl) {
	                      openRecord(item);
	                    }
	                  }}
	                >
                  <div className="content-main">
                    <span className="content-icon" />
                    <span className="content-title">{item.title}</span>
                  </div>
                  {item.type === "file" && (
                    <div className="content-actions">
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
                    </div>
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
      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        onClose={() => setDocModal({ open: false, title: "", url: "" })}
      />

      {insuranceMessage && (
        <div className={isErrorText(insuranceMessage) ? "error-banner" : "success-banner"}>
          {insuranceMessage}
        </div>
      )}
      {insuranceModalOpen ? (
        <div className="editor-modal" role="dialog" aria-modal="true">
          <div className="editor-shell" style={{ maxWidth: 720, margin: "8vh auto", height: "auto" }}>
            <div className="editor-header">
              <strong className="editor-title">Insurance update request</strong>
              <div className="editor-actions">
                <button
                  className="editor-close"
                  type="button"
                  onClick={() => setInsuranceModalOpen(false)}
                  disabled={insuranceBusy}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ padding: 18 }}>
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  generateInsuranceRequest();
                }}
              >
                <label>
                  Provider
                  <input
                    type="text"
                    value={insuranceForm.provider}
                    onChange={(e) => setInsuranceForm({ ...insuranceForm, provider: e.target.value })}
                    placeholder="Insurance Company"
                    required
                    disabled={insuranceBusy}
                  />
                </label>
                <label>
                  Policy number
                  <input
                    type="text"
                    value={insuranceForm.policyNumber}
                    onChange={(e) => setInsuranceForm({ ...insuranceForm, policyNumber: e.target.value })}
                    placeholder="1234 5678 9012"
                    disabled={insuranceBusy}
                  />
                </label>
                <label>
                  Valid to (optional)
                  <input
                    type="date"
                    lang="en-US"
                    value={insuranceForm.validTo}
                    onChange={(e) => setInsuranceForm({ ...insuranceForm, validTo: e.target.value })}
                    disabled={insuranceBusy}
                  />
                </label>
                <label>
                  Note (optional)
                  <textarea
                    rows="3"
                    value={insuranceForm.note}
                    onChange={(e) => setInsuranceForm({ ...insuranceForm, note: e.target.value })}
                    placeholder="What changed?"
                    disabled={insuranceBusy}
                  />
                </label>
                <div className="quick-actions is-start">
                  <button className="primary" type="submit" disabled={insuranceBusy}>
                    {insuranceBusy ? "Generating..." : "Generate"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setInsuranceModalOpen(false)}
                    disabled={insuranceBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

		    </PatientShell>
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

async function fetchFolderContents(folderId) {
  const response = await fetch(`/api/patients/folder-contents?folderId=${folderId}`, {
    credentials: "include"
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load folder contents");
  }
  return data.contents;
}

function applyAppointmentsCount(folders, session) {
  const activeCount = getActiveAppointmentsCount(session);
  return folders.map((folder) =>
    normalize(folder.title) === "appointments" ? { ...folder, count: activeCount } : folder
  );
}

function getActiveAppointmentsCount(session) {
  try {
    const raw = localStorage.getItem(getAppointmentsKey(session));
    const items = raw ? JSON.parse(raw) : [];
    return items.filter((item) => item?.status === "Scheduled").length;
  } catch {
    return 0;
  }
}

function filterFolderItems(folder, items, session) {
  if (normalize(folder?.title) !== "appointments") return items;
  const activeTicketIds = getActiveAppointmentTicketIds(session);
  if (activeTicketIds.size === 0) return [];
  return items.filter((item) => item?.type !== "file" || activeTicketIds.has(String(item.id)));
}

function getActiveAppointmentTicketIds(session) {
  try {
    const raw = localStorage.getItem(getAppointmentsKey(session));
    const items = raw ? JSON.parse(raw) : [];
    const ids = items
      .filter((item) => item?.status === "Scheduled" && item?.ticket?.id)
      .map((item) => String(item.ticket.id));
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function getAppointmentsKey(session) {
  const userId = session?.user?.docspaceId || "anon";
  const roomId = session?.room?.id || "room";
  return `${appointmentsStorageKey}.${userId}.${roomId}`;
}
