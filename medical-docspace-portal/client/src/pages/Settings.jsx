import { useEffect, useRef, useState } from "react";
import PatientShell from "../components/PatientShell.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";

const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const editorFrameId = "contact-change-editor-hidden";

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

export default function Settings({ session, onLogout, onNavigate, onSave }) {
  const initialRef = useRef({
    fullName: session?.user?.fullName || "",
    email: session?.user?.email || "",
    phone: session?.user?.phone || "",
    location: session?.user?.location || "",
    title: session?.user?.title || ""
  });
  const editorRef = useRef(null);

  const [form, setForm] = useState({
    fullName: session?.user?.fullName || "",
    email: session?.user?.email || "",
    phone: session?.user?.phone || "",
    sex: session?.user?.sex || "",
    location: session?.user?.location || "",
    title: session?.user?.title || "",
    comment: session?.user?.comment || ""
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });

  useEffect(() => {
    initialRef.current = {
      fullName: session?.user?.fullName || "",
      email: session?.user?.email || "",
      phone: session?.user?.phone || "",
      location: session?.user?.location || "",
      title: session?.user?.title || ""
    };
    setForm({
      fullName: session?.user?.fullName || "",
      email: session?.user?.email || "",
      phone: session?.user?.phone || "",
      sex: session?.user?.sex || "",
      location: session?.user?.location || "",
      title: session?.user?.title || "",
      comment: session?.user?.comment || ""
    });
  }, [
    session?.user?.fullName,
    session?.user?.email,
    session?.user?.phone,
    session?.user?.sex,
    session?.user?.location,
    session?.user?.title,
    session?.user?.comment
  ]);

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  const fillRequestHidden = async (file, payload) => {
    if (!file?.id) return;
    if (!docspaceUrl) {
      setRequestMessage("VITE_DOCSPACE_URL is not set.");
      return;
    }

    const token = file?.shareToken || session?.user?.token || "";
    if (!token) {
      setRequestMessage("DocSpace token is missing.");
      return;
    }

    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);

    const instance = window.DocSpace?.SDK?.initEditor({
      src: docspaceUrl,
      id: String(file.id),
      frameId: editorFrameId,
      requestToken: token,
      width: "1px",
      height: "1px",
      events: {
        onAppReady: () => {
          const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
          if (!frameInstance) {
            setRequestMessage("Editor frame is not available.");
            destroyEditor();
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
                    var before = d.before || {};
                    var after = d.after || {};

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

                    addTitle("CONTACT CHANGE REQUEST");
                    addSubtitle("Please review and update my profile details in the clinic records.");

                    addSection("Before");
                    addField("Full name", before.fullName);
                    addField("Email", before.email);
                    addField("Phone", before.phone);
                    addField("Location", before.location);
                    addField("Title", before.title);

                    addSection("After");
                    addField("Full name", after.fullName);
                    addField("Email", after.email);
                    addField("Phone", after.phone);
                    addField("Location", after.location);
                    addField("Title", after.title);

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
          setTimeout(() => destroyEditor(), 7000);
        },
        onAppError: () => {
          setTimeout(() => destroyEditor(), 1500);
        }
      }
    });

    editorRef.current = instance;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (typeof onSave !== "function") return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await onSave(form);
      const name = updated?.user?.fullName || form.fullName;
      const phone = updated?.user?.phone || form.phone || "-";
      setMessage(
        `Saved. Sent: ${form.fullName || "-"}, ${form.phone || "-"} | DocSpace returned: ${name}, ${phone}`
      );
    } catch (error) {
      setMessage(error?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const generateRequest = async () => {
    setRequestBusy(true);
    setRequestMessage("");
    try {
      const token = String(session?.user?.token || "").trim();
      if (!token) throw new Error("Authorization token is missing");
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");

      const payload = {
        before: initialRef.current || {},
        after: {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          location: form.location,
          title: form.title
        }
      };

      const response = await fetch("/api/patients/contact-change-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ roomId, payload })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Request create failed (${response.status})`);
      }

      const file = data?.file || null;
      if (!file?.id) {
        throw new Error("Failed to create request document");
      }

      await fillRequestHidden(file, payload);
      if (file?.openUrl) {
        setDocModal({ open: true, title: file.title || "Contact change request", url: file.openUrl });
      }
      setRequestMessage("Request document created in Contracts. Export to PDF in DocSpace if needed.");
    } catch (error) {
      setRequestMessage(error?.message || "Failed to create request document");
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <PatientShell
      user={session.user}
      active="settings"
      onNavigate={onNavigate}
      onLogout={onLogout}
      roomId={session?.room?.id}
      token={session?.user?.token}
    >
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Profile settings</h3>
            <p className="muted">Update your personal data stored in DocSpace.</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Full name
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            Sex
            <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
              <option value="">Not set</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </label>
          <label>
            Location
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label>
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Comment
            <textarea
              rows="3"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </label>
          <div className="quick-actions" style={{ justifyContent: "flex-start" }}>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={generateRequest}
              disabled={saving || requestBusy}
              title="Creates a request document in Contracts"
            >
              {requestBusy ? "Generating..." : "Generate request"}
            </button>
            <button className="secondary" type="button" onClick={() => onNavigate?.("dashboard")} disabled={saving}>
              Back
            </button>
          </div>
        </form>

        {message && <p className="muted">{message}</p>}
        {requestMessage && <p className="muted">{requestMessage}</p>}
      </section>

      <DocSpaceModal
        open={docModal.open}
        title={docModal.title}
        url={docModal.url}
        onClose={() => setDocModal({ open: false, title: "", url: "" })}
      />
      <div id={editorFrameId} className="hidden-editor" />
    </PatientShell>
  );
}
