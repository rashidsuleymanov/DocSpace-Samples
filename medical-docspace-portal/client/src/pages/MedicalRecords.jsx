import { useEffect, useRef, useState } from "react";

import PatientShell from "../components/PatientShell.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import FolderTile from "../components/FolderTile.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import folderStructure from "../data/folderStructure.js";
import { createFileShareLink } from "../services/docspaceApi.js";

const appointmentsStorageKey = "medical.portal.appointments";
const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const insuranceEditorFrameId = "insurance-request-editor-hidden";
const sickLeaveEditorFrameId = "sick-leave-request-editor-hidden";
const imagingEditorFrameId = "imaging-request-editor-hidden";

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

export default function MedicalRecords({
  session,
  onLogout,
  onNavigate,
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

  const [sickLeaveModalOpen, setSickLeaveModalOpen] = useState(false);
  const [sickLeaveBusy, setSickLeaveBusy] = useState(false);
  const [sickLeaveMessage, setSickLeaveMessage] = useState("");
  const [sickLeaveForm, setSickLeaveForm] = useState({
    startDate: "",
    endDate: "",
    reason: "",
    note: ""
  });

  const [imagingModalOpen, setImagingModalOpen] = useState(false);
  const [imagingBusy, setImagingBusy] = useState(false);
  const [imagingMessage, setImagingMessage] = useState("");
  const [imagingForm, setImagingForm] = useState({
    modality: "",
    studyDate: "",
    facility: "",
    link: "",
    note: ""
  });

  const [imagingUploadOpen, setImagingUploadOpen] = useState(false);
  const [imagingUploadBusy, setImagingUploadBusy] = useState(false);
  const [imagingUploadMessage, setImagingUploadMessage] = useState("");
  const [imagingUploadFile, setImagingUploadFile] = useState(null);

  const openRecord = (item) => {
    if (!item?.openUrl) return;
    setDocModal({
      open: true,
      title: item.title || "Medical record",
      url: item.openUrl
    });
  };

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  const fillInsuranceRequestHidden = async (file, payload) => {
    if (!file?.id) return;
    if (!docspaceUrl) throw new Error("VITE_DOCSPACE_URL is not set.");
    const token = file?.shareToken || session?.user?.token || "";
    if (!token) throw new Error("DocSpace token is missing.");

    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);

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
          setTimeout(() => destroyEditor(), 7000);
        },
        onAppError: () => {
          setTimeout(() => destroyEditor(), 1500);
        }
      }
    });

    editorRef.current = instance;
  };

  async function openFolder(folder) {
    if (!folder?.id) return;
    setActiveFolder(folder);
    setFolderContents([]);
    setFolderLoading(true);
    try {
      const contents = await fetchFolderContents(folder.id, session?.user?.token);
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
        const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
        const response = await fetch(`/api/patients/room-summary?roomId=${session.room.id}`, {
          headers
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
      const link = await createFileShareLink({ fileId: item.id, token: session?.user?.token });
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
  const isSickLeaveFolder = normalize(activeFolder?.title) === "sick leave";
  const isImagingFolder = normalize(activeFolder?.title) === "imaging";

  const generateInsuranceRequest = async () => {
    setInsuranceBusy(true);
    setInsuranceMessage("");
    try {
      const token = String(session?.user?.token || "").trim();
      if (!token) throw new Error("Authorization token is missing");
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
      if (!file?.id) throw new Error("Failed to create request document");

      await fillInsuranceRequestHidden(file, payload).catch(() => null);
      if (file?.openUrl) {
        setDocModal({ open: true, title: file.title || "Insurance update request", url: file.openUrl });
      }
      setInsuranceMessage("Request created in Insurance. Export to PDF in DocSpace if needed.");
      setInsuranceModalOpen(false);
      setInsuranceForm({ provider: "", policyNumber: "", validTo: "", note: "" });
    } catch (error) {
      setInsuranceMessage(error?.message || "Failed to create insurance request");
    } finally {
      setInsuranceBusy(false);
    }
  };

  const fillSickLeaveRequestHidden = async (file, payload) => {
    if (!file?.id) return;
    if (!docspaceUrl) throw new Error("VITE_DOCSPACE_URL is not set.");
    const token = file?.shareToken || session?.user?.token || "";
    if (!token) throw new Error("DocSpace token is missing.");

    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);

    const instance = window.DocSpace?.SDK?.initEditor({
      src: docspaceUrl,
      id: String(file.id),
      frameId: sickLeaveEditorFrameId,
      requestToken: token,
      width: "1px",
      height: "1px",
      events: {
        onAppReady: () => {
          const frameInstance = window.DocSpace?.SDK?.frames?.[sickLeaveEditorFrameId];
          if (!frameInstance) {
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
                    var patient = d.patient || {};
                    var leave = d.leave || {};

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

                    addTitle("SICK LEAVE REQUEST");
                    addSubtitle("Please issue a sick leave certificate for the period below.");

                    addSection("Patient");
                    addField("Name", patient.fullName);
                    addField("Email", patient.email);
                    addField("Phone", patient.phone);

                    addSection("Requested period");
                    addField("Start date", leave.startDate);
                    addField("End date", leave.endDate);
                    addField("Reason", leave.reason);
                    addField("Note", leave.note);

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

  const generateSickLeaveRequest = async () => {
    setSickLeaveBusy(true);
    setSickLeaveMessage("");
    try {
      const token = String(session?.user?.token || "").trim();
      if (!token) throw new Error("Authorization token is missing");
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");

      const payload = {
        patient: {
          fullName: session?.user?.fullName || "",
          email: session?.user?.email || "",
          phone: session?.user?.phone || ""
        },
        leave: { ...sickLeaveForm }
      };

      const response = await fetch("/api/patients/sick-leave-request", {
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
      if (!file?.id) throw new Error("Failed to create request document");

      await fillSickLeaveRequestHidden(file, payload).catch(() => null);
      if (file?.openUrl) {
        setDocModal({ open: true, title: file.title || "Sick leave request", url: file.openUrl });
      }
      setSickLeaveMessage("Request created in Sick Leave. Export to PDF in DocSpace if needed.");
      setSickLeaveModalOpen(false);
      setSickLeaveForm({ startDate: "", endDate: "", reason: "", note: "" });
    } catch (error) {
      setSickLeaveMessage(error?.message || "Failed to create sick leave request");
    } finally {
      setSickLeaveBusy(false);
    }
  };

  const fillImagingRequestHidden = async (file, payload) => {
    if (!file?.id) return;
    if (!docspaceUrl) throw new Error("VITE_DOCSPACE_URL is not set.");
    const token = file?.shareToken || session?.user?.token || "";
    if (!token) throw new Error("DocSpace token is missing.");

    destroyEditor();
    await loadDocSpaceSdk(docspaceUrl);

    const instance = window.DocSpace?.SDK?.initEditor({
      src: docspaceUrl,
      id: String(file.id),
      frameId: imagingEditorFrameId,
      requestToken: token,
      width: "1px",
      height: "1px",
      events: {
        onAppReady: () => {
          const frameInstance = window.DocSpace?.SDK?.frames?.[imagingEditorFrameId];
          if (!frameInstance) {
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
                    var patient = d.patient || {};
                    var imaging = d.imaging || {};

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

                    addTitle("IMAGING UPLOAD REQUEST");
                    addSubtitle("Please attach imaging results (PDF, images, or link) for doctor review.");

                    addSection("Patient");
                    addField("Name", patient.fullName);
                    addField("Email", patient.email);
                    addField("Phone", patient.phone);

                    addSection("Imaging study");
                    addField("Modality", imaging.modality);
                    addField("Study date", imaging.studyDate);
                    addField("Facility", imaging.facility);
                    addField("Link", imaging.link);
                    addField("Note", imaging.note);

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

  const generateImagingRequest = async () => {
    setImagingBusy(true);
    setImagingMessage("");
    try {
      const token = String(session?.user?.token || "").trim();
      if (!token) throw new Error("Authorization token is missing");
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");

      const payload = {
        patient: {
          fullName: session?.user?.fullName || "",
          email: session?.user?.email || "",
          phone: session?.user?.phone || ""
        },
        imaging: { ...imagingForm }
      };

      const response = await fetch("/api/patients/imaging-upload-request", {
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
      if (!file?.id) throw new Error("Failed to create request document");

      await fillImagingRequestHidden(file, payload).catch(() => null);
      if (file?.openUrl) {
        setDocModal({ open: true, title: file.title || "Imaging upload request", url: file.openUrl });
      }
      setImagingMessage("Request created in Imaging. Upload files to the Imaging folder in DocSpace and export to PDF if needed.");
      setImagingModalOpen(false);
      setImagingForm({ modality: "", studyDate: "", facility: "", link: "", note: "" });
    } catch (error) {
      setImagingMessage(error?.message || "Failed to create imaging request");
    } finally {
      setImagingBusy(false);
    }
  };

  const uploadImagingFile = async () => {
    setImagingUploadBusy(true);
    setImagingUploadMessage("");
    try {
      const token = String(session?.user?.token || "").trim();
      if (!token) throw new Error("Authorization token is missing");
      const roomId = String(session?.room?.id || "").trim();
      if (!roomId) throw new Error("Patient room is missing");
      if (!imagingUploadFile) throw new Error("Choose a file first");

      const fileName = String(imagingUploadFile.name || "imaging.bin");
      const contentType = String(imagingUploadFile.type || "application/octet-stream");
      const maxBytes = 15 * 1024 * 1024;
      if (imagingUploadFile.size > maxBytes) {
        throw new Error(`File too large (${imagingUploadFile.size} bytes). Max is ${maxBytes} bytes.`);
      }

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => {
          const result = String(reader.result || "");
          const comma = result.indexOf(",");
          if (comma < 0) {
            reject(new Error("Unexpected file encoding"));
            return;
          }
          resolve(result.slice(comma + 1));
        };
        reader.readAsDataURL(imagingUploadFile);
      });

      const response = await fetch("/api/patients/imaging/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({
          roomId,
          file: { fileName, base64, contentType }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Upload failed (${response.status})`);
      }

      setImagingUploadMessage("Uploaded. Refreshing folder...");
      setImagingUploadOpen(false);
      setImagingUploadFile(null);
      if (activeFolder?.id) {
        await openFolder(activeFolder);
      }
      setImagingUploadMessage("Uploaded to Imaging.");
    } catch (error) {
      setImagingUploadMessage(error?.message || "Upload failed");
    } finally {
      setImagingUploadBusy(false);
    }
  };

  return (
    <PatientShell
      user={session.user}
      active="records"
      onNavigate={onNavigate}
      onLogout={onLogout}
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
            <div className="quick-actions" style={{ justifyContent: "flex-end" }}>
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
              {isSickLeaveFolder && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setSickLeaveMessage("");
                    setSickLeaveModalOpen(true);
                  }}
                >
                  Sick leave request
                </button>
              )}
              {isImagingFolder && (
                <>
                  <button
                    className="primary"
                    type="button"
                    onClick={() => {
                      setImagingMessage("");
                      setImagingModalOpen(true);
                    }}
                  >
                    Imaging request
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      setImagingUploadMessage("");
                      setImagingUploadOpen(true);
                    }}
                  >
                    Upload file
                  </button>
                </>
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

      {insuranceMessage && <p className="muted">{insuranceMessage}</p>}
      {sickLeaveMessage && <p className="muted">{sickLeaveMessage}</p>}
      {imagingMessage && <p className="muted">{imagingMessage}</p>}
      {imagingUploadMessage && <p className="muted">{imagingUploadMessage}</p>}
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
                <div className="quick-actions" style={{ justifyContent: "flex-start" }}>
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

      {sickLeaveModalOpen ? (
        <div className="editor-modal" role="dialog" aria-modal="true">
          <div className="editor-shell" style={{ maxWidth: 720, margin: "8vh auto", height: "auto" }}>
            <div className="editor-header">
              <strong className="editor-title">Sick leave request</strong>
              <div className="editor-actions">
                <button
                  className="editor-close"
                  type="button"
                  onClick={() => setSickLeaveModalOpen(false)}
                  disabled={sickLeaveBusy}
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
                  generateSickLeaveRequest();
                }}
              >
                <label>
                  Start date
                  <input
                    type="date"
                    lang="en-US"
                    value={sickLeaveForm.startDate}
                    onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, startDate: e.target.value })}
                    required
                    disabled={sickLeaveBusy}
                  />
                </label>
                <label>
                  End date (optional)
                  <input
                    type="date"
                    lang="en-US"
                    value={sickLeaveForm.endDate}
                    onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, endDate: e.target.value })}
                    disabled={sickLeaveBusy}
                  />
                </label>
                <label>
                  Reason (optional)
                  <input
                    type="text"
                    value={sickLeaveForm.reason}
                    onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, reason: e.target.value })}
                    placeholder="Flu symptoms"
                    disabled={sickLeaveBusy}
                  />
                </label>
                <label>
                  Note (optional)
                  <textarea
                    rows="3"
                    value={sickLeaveForm.note}
                    onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, note: e.target.value })}
                    placeholder="Any additional details"
                    disabled={sickLeaveBusy}
                  />
                </label>
                <div className="quick-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary" type="submit" disabled={sickLeaveBusy}>
                    {sickLeaveBusy ? "Generating..." : "Generate"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setSickLeaveModalOpen(false)}
                    disabled={sickLeaveBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {imagingModalOpen ? (
        <div className="editor-modal" role="dialog" aria-modal="true">
          <div className="editor-shell" style={{ maxWidth: 720, margin: "8vh auto", height: "auto" }}>
            <div className="editor-header">
              <strong className="editor-title">Imaging upload request</strong>
              <div className="editor-actions">
                <button
                  className="editor-close"
                  type="button"
                  onClick={() => setImagingModalOpen(false)}
                  disabled={imagingBusy}
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
                  generateImagingRequest();
                }}
              >
                <label>
                  Modality
                  <input
                    type="text"
                    value={imagingForm.modality}
                    onChange={(e) => setImagingForm({ ...imagingForm, modality: e.target.value })}
                    placeholder="MRI / CT / X-ray / Ultrasound"
                    required
                    disabled={imagingBusy}
                  />
                </label>
                <label>
                  Study date (optional)
                  <input
                    type="date"
                    lang="en-US"
                    value={imagingForm.studyDate}
                    onChange={(e) => setImagingForm({ ...imagingForm, studyDate: e.target.value })}
                    disabled={imagingBusy}
                  />
                </label>
                <label>
                  Facility (optional)
                  <input
                    type="text"
                    value={imagingForm.facility}
                    onChange={(e) => setImagingForm({ ...imagingForm, facility: e.target.value })}
                    placeholder="City Imaging Center"
                    disabled={imagingBusy}
                  />
                </label>
                <label>
                  Link (optional)
                  <input
                    type="url"
                    value={imagingForm.link}
                    onChange={(e) => setImagingForm({ ...imagingForm, link: e.target.value })}
                    placeholder="https://..."
                    disabled={imagingBusy}
                  />
                </label>
                <label>
                  Note (optional)
                  <textarea
                    rows="3"
                    value={imagingForm.note}
                    onChange={(e) => setImagingForm({ ...imagingForm, note: e.target.value })}
                    placeholder="What should the doctor look for?"
                    disabled={imagingBusy}
                  />
                </label>
                <p className="muted" style={{ marginTop: 0 }}>
                  After generating the request, upload your files into the <strong>Imaging</strong> folder in DocSpace.
                </p>
                <div className="quick-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary" type="submit" disabled={imagingBusy}>
                    {imagingBusy ? "Generating..." : "Generate"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setImagingModalOpen(false)}
                    disabled={imagingBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {imagingUploadOpen ? (
        <div className="editor-modal" role="dialog" aria-modal="true">
          <div className="editor-shell" style={{ maxWidth: 720, margin: "8vh auto", height: "auto" }}>
            <div className="editor-header">
              <strong className="editor-title">Upload imaging file</strong>
              <div className="editor-actions">
                <button
                  className="editor-close"
                  type="button"
                  onClick={() => setImagingUploadOpen(false)}
                  disabled={imagingUploadBusy}
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
                  uploadImagingFile();
                }}
              >
                <label>
                  File
                  <input
                    type="file"
                    onChange={(e) => setImagingUploadFile(e.target.files?.[0] || null)}
                    disabled={imagingUploadBusy}
                    accept=".pdf,.png,.jpg,.jpeg,.dcm,application/pdf,image/*"
                  />
                </label>
                <p className="muted" style={{ marginTop: 0 }}>
                  Max 15 MB (sample limitation). For larger studies, upload in DocSpace directly.
                </p>
                <div className="quick-actions" style={{ justifyContent: "flex-start" }}>
                  <button className="primary" type="submit" disabled={imagingUploadBusy || !imagingUploadFile}>
                    {imagingUploadBusy ? "Uploading..." : "Upload"}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setImagingUploadOpen(false)}
                    disabled={imagingUploadBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <div id={insuranceEditorFrameId} className="hidden-editor" />
      <div id={sickLeaveEditorFrameId} className="hidden-editor" />
      <div id={imagingEditorFrameId} className="hidden-editor" />
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
