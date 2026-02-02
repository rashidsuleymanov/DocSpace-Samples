import { useEffect, useMemo, useRef, useState } from "react";
import PatientShell from "../components/PatientShell.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";

const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const editorFrameId = "fill-sign-hidden-editor";
let sdkLoaderPromise = null;

function loadDocSpaceSdk(src) {
  if (sdkLoaderPromise) return sdkLoaderPromise;
  sdkLoaderPromise = new Promise((resolve, reject) => {
    if (window.DocSpace?.SDK) {
      resolve(window.DocSpace.SDK);
      return;
    }
    if (!src) {
      reject(new Error("DocSpace URL is missing"));
      return;
    }
    const script = document.createElement("script");
    script.src = `${src}/static/scripts/sdk/2.0.0/api.js`;
    script.async = true;
    script.onload = () => resolve(window.DocSpace?.SDK);
    script.onerror = () => reject(new Error("Failed to load DocSpace SDK"));
    document.head.appendChild(script);
  });
  return sdkLoaderPromise;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchFolderContents(folderId, token) {
  const headers = token ? { Authorization: token } : undefined;
  const response = await fetch(`/api/patients/folder-contents?folderId=${folderId}`, {
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load folder contents");
  }
  return data.contents || { items: [] };
}

export default function FillSign({ session, onLogout, onNavigate }) {
  const [tab, setTab] = useState("action");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionItems, setActionItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });
  const editorRef = useRef(null);

  const loadItems = async () => {
    if (!session?.room?.id || session.room.id === "DOCSPACE") {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
      const response = await fetch(`/api/patients/room-summary?roomId=${session.room.id}`, {
        headers
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load room summary");
      }
      const summary = data.summary || [];
      const fillFolder = summary.find((item) => normalize(item.title) === "fill & sign");
      if (!fillFolder?.id) {
        setActionItems([]);
        setCompletedItems([]);
        setLoading(false);
        return;
      }

      const fillContents = await fetchFolderContents(fillFolder.id, session?.user?.token);
      const subfolders = (fillContents.items || []).filter((item) => item.type === "folder");
      const inProcess = subfolders.find((item) => normalize(item.title) === "in process");
      const complete = subfolders.find((item) => normalize(item.title) === "complete");

      const mapFiles = (contents, status) =>
        (contents.items || [])
          .filter((item) => item.type === "file")
          .map((item) => ({
            id: item.id,
            title: item.title,
            url: item.openUrl || item.url || item.webUrl || null,
            status,
            initiatedBy: "City Clinic"
          }));

      const [inProcessContents, completeContents] = await Promise.all([
        inProcess?.id ? fetchFolderContents(inProcess.id, session?.user?.token) : { items: [] },
        complete?.id ? fetchFolderContents(complete.id, session?.user?.token) : { items: [] }
      ]);

      setActionItems(mapFiles(inProcessContents, "action"));
      setCompletedItems(mapFiles(completeContents, "completed"));
    } catch (loadError) {
      setError(loadError.message || "Failed to load Fill & Sign documents");
      setActionItems([]);
      setCompletedItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [session]);

  useEffect(() => {
    let host = document.getElementById(editorFrameId);
    if (!host) {
      host = document.createElement("div");
      host.id = editorFrameId;
      host.className = "hidden-editor";
      document.body.appendChild(host);
    }
    return () => {
      if (host?.parentNode) {
        host.parentNode.removeChild(host);
      }
    };
  }, []);

  const items = useMemo(
    () => (tab === "action" ? actionItems : completedItems),
    [tab, actionItems, completedItems]
  );

  const badgeCounts = {
    fillSign: actionItems.length
  };

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  const runFormCheck = async (fileId) => {
    if (!docspaceUrl) throw new Error("DocSpace URL is missing");
    const token = session?.user?.token;
    if (!token) throw new Error("DocSpace token is missing");

    destroyEditor();

    await loadDocSpaceSdk(docspaceUrl);

    const result = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve({ complete: false, reason: "timeout" }), 20000);
      const handler = (event) => {
        if (event?.data?.type !== "fill-check") return;
        if (String(event.data.fileId) !== String(fileId)) return;
        window.removeEventListener("message", handler);
        clearTimeout(timeoutId);
        resolve(event.data);
      };
      window.addEventListener("message", handler);
      let executed = false;
      const executeCheck = () => {
        if (executed) return;
        executed = true;
        const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
        if (!frameInstance) {
          resolve({ complete: false, reason: "no-frame" });
          return;
        }
        const callback = new Function(
          "editorInstance",
          `
                try {
                  function sendResult(payload) {
                    try {
                      if (window.parent && window.parent.postMessage) {
                        window.parent.postMessage(payload, "*");
                        return;
                      }
                      if (window.top && window.top.postMessage) {
                        window.top.postMessage(payload, "*");
                        return;
                      }
                    } catch (e) {}
                  }
                  if (!editorInstance || typeof editorInstance.createConnector !== "function") {
                    sendResult({ type: "fill-check", fileId: ${JSON.stringify(fileId)}, complete: false, reason: "no-connector" });
                    return;
                  }
                  const connector = editorInstance.createConnector();
                  if (!connector || typeof connector.callCommand !== "function") {
                    sendResult({ type: "fill-check", fileId: ${JSON.stringify(fileId)}, complete: false, reason: "no-command" });
                    return;
                  }
                  connector.callCommand(function () {
                    var complete = true;
                    var missing = [];
                    var formData = {};
                    var diagnostics = {
                      hasGetAllForms: !!Api.GetAllForms,
                      hasGetAllContentControls: !!Api.GetAllContentControls
                    };
                    try {
                      var controls = [];
                      if (Api.GetAllForms) {
                        controls = Api.GetAllForms();
                      } else if (Api.GetAllContentControls) {
                        controls = Api.GetAllContentControls();
                      }
                      diagnostics.controlsLength = controls ? controls.length : 0;
                      if (controls && controls.length) {
                        for (var i = 0; i < controls.length; i += 1) {
                          var ctrl = controls[i];
                          if (!ctrl) continue;
                          var key = "";
                          var formType = "";
                          try {
                            if (ctrl.GetFormKey) key = ctrl.GetFormKey();
                            if (ctrl.GetFormType) formType = ctrl.GetFormType();
                          } catch (e) {}
                          if (!diagnostics.formTypes) diagnostics.formTypes = [];
                          if (formType) diagnostics.formTypes.push(formType);
                          var isRequired = true;
                          try {
                            if (ctrl.IsRequired) isRequired = !!ctrl.IsRequired();
                            else if (ctrl.GetRequired) isRequired = !!ctrl.GetRequired();
                          } catch (e) {
                            isRequired = true;
                          }
                          var value = "";
                          var isEmpty = false;
                          if (formType === "checkBoxForm" && ctrl.IsChecked) {
                            value = ctrl.IsChecked();
                            isEmpty = !value;
                          } else if (ctrl.GetText) {
                            value = ctrl.GetText();
                            isEmpty = !value || !String(value).trim();
                          } else if (ctrl.GetValue) {
                            value = ctrl.GetValue();
                            isEmpty = !value || !String(value).trim();
                          }
                          formData[key || "field_" + i] = value;
                          if (isRequired && isEmpty) {
                            complete = false;
                            missing.push(key || "field_" + i);
                          }
                        }
                      }
                    } catch (e) {
                      complete = false;
                    }
                    return JSON.stringify({
                      type: "fill-check",
                      fileId: ${JSON.stringify(fileId)},
                      complete: complete,
                      missing: missing,
                      data: formData,
                      diagnostics: diagnostics
                    });
                  }, function (result) {
                    var payload = null;
                    try {
                      payload = typeof result === "string" ? JSON.parse(result) : result;
                    } catch (e) {}
                    if (!payload || payload.type !== "fill-check") {
                      payload = { type: "fill-check", fileId: ${JSON.stringify(fileId)}, complete: false, reason: "no-result" };
                    }
                    sendResult(payload);
                  });
                } catch (e) {
                  sendResult({ type: "fill-check", fileId: ${JSON.stringify(fileId)}, complete: false, reason: "error" });
                }
              `
        );
        frameInstance.executeInEditor(callback);
      };

      const instance = window.DocSpace?.SDK?.initEditor({
        src: docspaceUrl,
        id: String(fileId),
        frameId: editorFrameId,
        requestToken: token,
        width: "800px",
        height: "600px",
        events: {
          onAppReady: () => {
            console.log("[fill-sign] editor ready", fileId);
            executeCheck();
          },
          onContentReady: () => {
            console.log("[fill-sign] content ready", fileId);
            executeCheck();
          },
          onAppError: () => {
            resolve({ complete: false, reason: "error" });
          }
        }
      });
      editorRef.current = instance;
    });

    destroyEditor();
    return result;
  };

  const handleComplete = async (item) => {
    if (!item?.id) return;
    setBusyId(item.id);
    setError("");
    try {
      destroyEditor();
      const response = await fetch("/api/patients/fill-sign/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: session.room.id, fileId: item.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to move document");
      }
      await loadItems();
    } catch (err) {
      setError(err.message || "Failed to complete document");
    } finally {
      setBusyId("");
    }
  };

  return (
    <PatientShell
      user={session.user}
      active="fill-sign"
      onNavigate={onNavigate}
      onLogout={onLogout}
      roomId={session?.room?.id}
      token={session?.user?.token}
      badgeCounts={badgeCounts}
    >
      <section className="panel">
        <div className="panel-tabs">
          <button
            type="button"
            className={`tab-pill ${tab === "action" ? "active" : ""}`}
            onClick={() => setTab("action")}
          >
            Requires action <span className="tab-count">{badgeCounts.fillSign}</span>
          </button>
          <button
            type="button"
            className={`tab-pill ${tab === "completed" ? "active" : ""}`}
            onClick={() => setTab("completed")}
          >
            Completed <span className="tab-count">{completedItems.length}</span>
          </button>
        </div>

        {loading && <p className="muted">Loading documents...</p>}
        {error && !loading && <p className="error-banner">Error: {error}</p>}
        {!loading && items.length === 0 && (
          <p className="muted">No documents in this section yet.</p>
        )}
        {!loading && items.length > 0 && (
          <div className="fill-grid">
            {items.map((item) => (
              <article key={item.id} className="fill-card">
                <div className={`fill-thumb fill-thumb-${item.status}`} />
                <div className="fill-body">
                  <h4>{item.title}</h4>
                  <p className="muted">
                    {item.status === "action" ? "Waiting for your signature" : "Completed"}
                  </p>
                  <p className="muted">Initiated by: {item.initiatedBy}</p>
                  <div className="fill-actions">
                    <button
                      className={item.status === "action" ? "primary" : "secondary"}
                      type="button"
                      onClick={() => {
                        if (item.url) {
                          if (item.status === "action") {
                            const fillUrl = item.url.includes("?")
                              ? `${item.url}&action=fill`
                              : `${item.url}?action=fill`;
                            setDocModal({
                              open: true,
                              title: item.title || "Fill form",
                              url: fillUrl
                            });
                          } else {
                            setDocModal({
                              open: true,
                              title: item.title || "Document",
                              url: item.url
                            });
                          }
                        }
                      }}
                    >
                      {item.status === "action" ? "Open & Sign" : "View"}
                    </button>
                    {item.status === "action" && (
                      <button
                        className="ghost ghost-dark"
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => handleComplete(item)}
                      >
                        {busyId === item.id ? "Moving..." : "Mark completed"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        onClose={() => setDocModal({ open: false, title: "", url: "" })}
      />
    </PatientShell>
  );
}
