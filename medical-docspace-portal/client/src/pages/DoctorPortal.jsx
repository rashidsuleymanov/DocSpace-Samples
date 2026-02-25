import { useEffect, useMemo, useRef, useState } from "react";

import DoctorSidebar from "../components/DoctorSidebar.jsx";
import DoctorTopbar from "../components/DoctorTopbar.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import FolderTile from "../components/FolderTile.jsx";
import folderStructure from "../data/folderStructure.js";
import {
  cancelDoctorFillSignRequest,
  copyLabResultFromDocSpace,
  createLabResult,
  createDoctorFileShareLink,
  createImagingPackage,
  createMedicalRecord,
  createPrescription,
  createRoomDocument,
  getDoctorAppointments,
  getDoctorIncomingFillSign,
  getDoctorFillSignContents,
  getDoctorFolderContents,
  getDoctorFolderContentsById,
  getDoctorRoomSummary,
  getDoctorRooms,
  listLabFiles,
  listTemplateFiles,
  requestFillSign,
  uploadImagingFile
} from "../services/doctorApi.js";

const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const editorFrameId = "doctor-hidden-editor";

let sdkLoaderPromise = null;

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

const folderMetaByTitle = new Map(
  folderStructure.map((item) => [normalizeTitle(item.title), item])
);

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}


export default function DoctorPortal({ doctor, onExit }) {
  const [view, setView] = useState("doctor-schedule");
  const [rooms, setRooms] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [summary, setSummary] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [labLoading, setLabLoading] = useState(false);
  const [activeFolderTitle, setActiveFolderTitle] = useState("");
  const [folderStack, setFolderStack] = useState([]);
  const [activeFolderItems, setActiveFolderItems] = useState([]);
  const [activeFolderLoading, setActiveFolderLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [templateFiles, setTemplateFiles] = useState([]);
  const [templatesQuery, setTemplatesQuery] = useState("");
  const [fillTab, setFillTab] = useState("action");
  const [fillItems, setFillItems] = useState([]);
  const [fillLoading, setFillLoading] = useState(false);
  const [fillError, setFillError] = useState("");
  const [fillCounts, setFillCounts] = useState({ action: 0, completed: 0 });
  const [inboxTab, setInboxTab] = useState("action");
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxCounts, setInboxCounts] = useState({ action: 0, completed: 0 });
  const [fillPatientQuery, setFillPatientQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [appointments, setAppointments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });

  const [labModalOpen, setLabModalOpen] = useState(false);
  const [labMode, setLabMode] = useState("local");
  const [labFile, setLabFile] = useState(null);
  const [imagingUploadOpen, setImagingUploadOpen] = useState(false);
  const [imagingUploadFile, setImagingUploadFile] = useState(null);
  const [imagingReportForm, setImagingReportForm] = useState({
    modality: "",
    studyDate: "",
    findings: "",
    impression: ""
  });
  const [imagingPackageOpen, setImagingPackageOpen] = useState(false);
  const [imagingPackageFiles, setImagingPackageFiles] = useState([]);
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [docCreateModalOpen, setDocCreateModalOpen] = useState(false);
  const [sickLeaveOpen, setSickLeaveOpen] = useState(false);
  const [sickLeaveForm, setSickLeaveForm] = useState({
    startDate: "",
    endDate: "",
    diagnosis: "",
    note: ""
  });

  const [labForm, setLabForm] = useState({ title: "" });
  const [rxForm, setRxForm] = useState({ medication: "", dosage: "", instructions: "" });
  const [recordForm, setRecordForm] = useState({
    appointmentId: "",
    type: "Visit note",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    summary: ""
  });
  const [docCreateForm, setDocCreateForm] = useState({ title: "" });

  const editorRef = useRef(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const filteredRooms = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => String(room.patientName || "").toLowerCase().includes(query));
  }, [rooms, patientQuery]);

  const filteredFillRooms = useMemo(() => {
    const query = fillPatientQuery.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => String(room.patientName || "").toLowerCase().includes(query));
  }, [rooms, fillPatientQuery]);

  const patientAppointments = useMemo(() => {
    if (!selectedRoom) return [];
    return appointments.filter((item) => item.roomId === selectedRoom.id && item.status === "Scheduled");
  }, [appointments, selectedRoom]);

  const scheduledAppointments = useMemo(
    () => appointments.filter((item) => item.status === "Scheduled"),
    [appointments]
  );

  const doctorFolders = useMemo(() => {
    return summary.map((folder) => {
      const meta = folderMetaByTitle.get(normalizeTitle(folder.title)) || {};
      const count = (folder.filesCount || 0) + (folder.foldersCount || 0);
      return {
        id: folder.id,
        title: folder.title,
        icon: meta.icon || "folder",
        description: meta.description || "Patient documents",
        count
      };
    });
  }, [summary]);

  const filteredTemplates = useMemo(() => {
    const query = templatesQuery.trim().toLowerCase();
    if (!query) return templateFiles;
    return templateFiles.filter((file) =>
      String(file.title || "").toLowerCase().includes(query)
    );
  }, [templateFiles, templatesQuery]);

  const handleDoctorFolderClick = async (folder) => {
    const name = folder?.title;
    if (!name || !selectedRoomId) return;
    setActiveFolderTitle(name);
    setFolderStack(folder?.id ? [{ id: folder.id, title: folder.title }] : []);
    setActiveFolderItems([]);
    setActiveFolderLoading(true);
    try {
      const contents = folder?.id ? await getDoctorFolderContentsById(folder.id) : await getDoctorFolderContents(selectedRoomId, name);
      setActiveFolderItems(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to load folder contents");
    } finally {
      setActiveFolderLoading(false);
    }
  };

  const openFolderById = async ({ id, title }) => {
    if (!id) return;
    setActiveFolderLoading(true);
    setMessage("");
    try {
      const contents = await getDoctorFolderContentsById(id);
      setActiveFolderItems(contents.items || []);
      setFolderStack((prev) => [...(Array.isArray(prev) ? prev : []), { id, title: title || "Folder" }]);
    } catch (error) {
      setMessage(error.message || "Failed to load folder contents");
    } finally {
      setActiveFolderLoading(false);
    }
  };

  const goFolderBack = async () => {
    const stack = Array.isArray(folderStack) ? folderStack : [];
    if (stack.length <= 1) {
      setActiveFolderTitle("");
      setActiveFolderItems([]);
      setFolderStack([]);
      return;
    }
    const nextStack = stack.slice(0, -1);
    const target = nextStack.at(-1);
    setFolderStack(nextStack);
    if (!target?.id) return;
    setActiveFolderLoading(true);
    try {
      const contents = await getDoctorFolderContentsById(target.id);
      setActiveFolderItems(contents.items || []);
    } finally {
      setActiveFolderLoading(false);
    }
  };

  const openActiveFolderItem = (item) => {
    if (item?.type !== "file") return;
    const title = String(item?.title || "");
    const isImage = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(title);
    if (isImage && item?.id) {
      createDoctorFileShareLink(item.id)
        .then((link) => openDoc(title || "Imaging", link?.shareLink || link?.shareUrl || link?.url || item.openUrl))
        .catch(() => {
          if (item.openUrl) openDoc(title || "Imaging", item.openUrl);
        });
      return;
    }
    if (item.openUrl) openDoc(title || "Document", item.openUrl);
  };

  const canCancelFillSignItem = (item) => {
    if (!item || item.status === "completed") return false;
    if (String(item?.initiatedByType || "").trim() !== "clinic") return false;
    const requestedBy = String(item?.requestedBy || "").trim().toLowerCase();
    const doctorEmail = String(doctor?.email || "").trim().toLowerCase();
    return doctorEmail && requestedBy === doctorEmail;
  };

  const isLabFolderActive = activeFolderTitle === "Lab Results";
  const isPrescriptionFolderActive = activeFolderTitle === "Prescriptions";
  const isImagingFolderActive = activeFolderTitle === "Imaging";
  const isSickLeaveFolderActive = activeFolderTitle === "Sick Leave";
  const isGenericDocFolderActive = ["Contracts", "Insurance", "Personal Data"].includes(
    activeFolderTitle
  );

  useEffect(() => {
    const loadRooms = async () => {
      try {
        const data = await getDoctorRooms();
        setRooms(data);
        if (!selectedRoomId && data[0]?.id) {
          setSelectedRoomId(data[0].id);
        }
      } catch (error) {
        setMessage(error.message || "Failed to load rooms");
      }
    };
    loadRooms();
  }, []);

  useEffect(() => {
    const loadSummary = async () => {
      if (!selectedRoomId) return;
      try {
        const data = await getDoctorRoomSummary(selectedRoomId);
        setSummary(data);
      } catch (error) {
        setSummary([]);
        setMessage(error.message || "Failed to load room summary");
      }
    };
    loadSummary();
  }, [selectedRoomId]);

  useEffect(() => {
    setActiveFolderTitle("");
    setActiveFolderItems([]);
    setFolderStack([]);
  }, [selectedRoomId]);

  useEffect(() => {
    const loadLabResults = async () => {
      if (!selectedRoomId) return;
      try {
        setLabLoading(true);
        const contents = await getDoctorFolderContents(selectedRoomId, "Lab Results");
        const items = contents.items || [];
        setLabResults(items);
        if (activeFolderTitle === "Lab Results") {
          setActiveFolderItems(items);
        }
      } catch {
        setLabResults([]);
      } finally {
        setLabLoading(false);
      }
    };
    loadLabResults();
  }, [selectedRoomId]);

  useEffect(() => {
    if ((!labModalOpen || labMode !== "docspace") && !fillModalOpen) return;
    let cancelled = false;
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        setTemplatesError("");
        const data = fillModalOpen ? await listTemplateFiles() : await listLabFiles();
        if (cancelled) return;
        setTemplateFiles(data.files || []);
      } catch (error) {
        if (cancelled) return;
        setTemplatesError(error.message || "Failed to load files");
        setTemplateFiles([]);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    };
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [labModalOpen, labMode, fillModalOpen]);

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const data = await getDoctorAppointments(dateFilter);
        setAppointments(data);
      } catch (error) {
        setAppointments([]);
        setMessage(error.message || "Failed to load appointments");
      }
    };
    loadAppointments();
  }, [dateFilter]);

  useEffect(() => {
    if (view !== "doctor-fill-sign") return;
    if (!selectedRoomId) {
      setFillItems([]);
      return;
    }
    loadFillItems(selectedRoomId, fillTab);
  }, [view, selectedRoomId, fillTab]);

  useEffect(() => {
    if (view !== "doctor-inbox") return;
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, inboxTab]);

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

  const destroyEditor = () => {
    if (editorRef.current?.destroy) {
      editorRef.current.destroy();
    }
    editorRef.current = null;
  };

  const runHiddenEditor = async (file, payload) => {
    const requestToken = file?.requestToken || file?.shareToken || "";
    if (!file?.id || !requestToken) return;
    if (!docspaceUrl) {
      setMessage("VITE_DOCSPACE_URL is not set.");
      return;
    }

    return new Promise(async (resolve, reject) => {
      let done = false;
      const finish = (fn) => {
        if (done) return;
        done = true;
        try {
          destroyEditor();
        } finally {
          fn();
        }
      };

      destroyEditor();

      try {
        await loadDocSpaceSdk(docspaceUrl);
        const instance = window.DocSpace?.SDK?.initEditor({
          src: docspaceUrl,
          id: String(file.id),
          frameId: editorFrameId,
          requestToken,
          width: "1px",
          height: "1px",
          events: {
            onAppReady: () => {
              const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
              if (!frameInstance) {
                finish(() => reject(new Error("Hidden editor frame not available")));
                return;
              }
              const callback = new Function(
                "editorInstance",
                `
                try {
                  if (!editorInstance || typeof editorInstance.createConnector !== "function") {
                    console.error("Editor instance is invalid", editorInstance);
                    return;
                  }
                  const connector = editorInstance.createConnector();
                  if (!connector || typeof connector.callCommand !== "function") {
                    console.error("Connector is invalid", connector);
                    return;
                  }
                  Asc.scope.payload = ${JSON.stringify(payload)};
                  connector.callCommand(function () {
                    try {
                      var data = Asc.scope.payload || {};
                      var doc = Api.GetDocument();

                      if (doc.RemoveAllElements) doc.RemoveAllElements();

                      var textPr = doc.GetDefaultTextPr();
                      textPr.SetFontFamily("Calibri");
                      textPr.SetFontSize(26);
                      textPr.SetLanguage("en-US");

                      var normalStyle = doc.GetDefaultStyle("paragraph");
                      var normalParaPr = normalStyle.GetParaPr();
                      normalParaPr.SetSpacingLine(240, "auto");
                      normalParaPr.SetSpacingAfter(120);
                      normalParaPr.SetJc("left");

                      var normalTextPr = normalStyle.GetTextPr();
                      normalTextPr.SetColor(0x26, 0x26, 0x26, false);

                      var titleStyle = doc.CreateStyle("DoctorDocTitle", "paragraph");
                      var titleParaPr = titleStyle.GetParaPr();
                      titleParaPr.SetJc("left");
                      titleParaPr.SetSpacingAfter(180);
                      var titleTextPr = titleStyle.GetTextPr();
                      titleTextPr.SetFontFamily("Calibri Light");
                      titleTextPr.SetFontSize(54);
                      titleTextPr.SetColor(0x22, 0x33, 0x55, false);

                      var subtitleStyle = doc.CreateStyle("DoctorDocSubtitle", "paragraph");
                      var subParaPr = subtitleStyle.GetParaPr();
                      subParaPr.SetJc("left");
                      subParaPr.SetSpacingAfter(160);
                      var subTextPr = subtitleStyle.GetTextPr();
                      subTextPr.SetFontFamily("Calibri");
                      subTextPr.SetFontSize(24);
                      subTextPr.SetColor(0x5f, 0x6b, 0x7a, false);

                      var sectionStyle = doc.CreateStyle("DoctorDocSection", "paragraph");
                      var sectionParaPr = sectionStyle.GetParaPr();
                      sectionParaPr.SetJc("left");
                      sectionParaPr.SetSpacingBefore(160);
                      sectionParaPr.SetSpacingAfter(120);
                      var sectionTextPr = sectionStyle.GetTextPr();
                      sectionTextPr.SetFontFamily("Calibri");
                      sectionTextPr.SetFontSize(28);
                      sectionTextPr.SetBold(true);
                      sectionTextPr.SetColor(0x22, 0x33, 0x55, false);

                      var fieldStyle = doc.CreateStyle("DoctorDocField", "paragraph");
                      var fieldParaPr = fieldStyle.GetParaPr();
                      fieldParaPr.SetJc("left");
                      fieldParaPr.SetIndLeft(480);
                      fieldParaPr.SetIndRight(480);
                      fieldParaPr.SetSpacingAfter(110);
                      var fieldTextPr = fieldStyle.GetTextPr();
                      fieldTextPr.SetFontFamily("Calibri");
                      fieldTextPr.SetFontSize(26);
                      fieldTextPr.SetColor(0x26, 0x26, 0x26, false);

                      function safeText(v) {
                        return (v && String(v).trim()) ? String(v) : "-";
                      }

                      function pushPara(p) {
                        if (doc.Push) doc.Push(p);
                        else doc.InsertContent([p]);
                      }

                      function addTitle(text, subtitle, meta) {
                        var p = Api.CreateParagraph();
                        p.SetStyle(titleStyle);
                        p.AddText(text);
                        pushPara(p);

                        if (subtitle) {
                          var sp = Api.CreateParagraph();
                          sp.SetStyle(subtitleStyle);
                          sp.AddText(subtitle);
                          pushPara(sp);
                        }

                        if (meta) {
                          var mp = Api.CreateParagraph();
                          mp.SetStyle(subtitleStyle);
                          mp.SetSpacingAfter(200);
                          mp.AddText(meta);
                          pushPara(mp);
                        }
                      }

                      function addSection(text) {
                        var p = Api.CreateParagraph();
                        p.SetStyle(sectionStyle);
                        p.AddText(text);
                        pushPara(p);
                      }

                      function addField(label, value) {
                        var p = Api.CreateParagraph();
                        p.SetStyle(fieldStyle);
                        var r1 = p.AddText(label + ": ");
                        r1.SetBold(true);
                        r1.SetColor(0x29, 0x33, 0x4F, false);
                        p.AddText(safeText(value));
                        pushPara(p);
                      }

                      function addBody(text) {
                        var p = Api.CreateParagraph();
                        p.SetStyle(fieldStyle);
                        p.SetIndLeft(0);
                        p.SetIndRight(0);
                        p.SetSpacingAfter(160);
                        p.AddText(safeText(text));
                        pushPara(p);
                      }

	                      if (data.type === "prescription") {
	                        addTitle(
	                          "Prescription",
                          data.patient ? "Issued for " + data.patient : "",
                          data.date ? data.date + " · " + safeText(data.doctor) : safeText(data.doctor)
                        );
                        addSection("Patient Details");
                        addField("Patient", data.patient);
                        addField("Doctor", data.doctor);
                        addField("Date", data.date);
                        addSection("Medication");
                        addField("Name", data.medication);
                        addField("Dosage", data.dosage);
	                        addSection("Instructions");
	                        addBody(data.instructions);
	                      } else if (data.type === "medical-record") {
	                        addTitle(
	                          "Medical Record",
                          data.patient ? "Visit summary for " + data.patient : "",
                          data.date ? data.date + " · " + safeText(data.doctor) : safeText(data.doctor)
                        );
                        addSection("Visit Details");
                        addField("Patient", data.patient);
                        addField("Doctor", data.doctor);
                        addField("Appointment", data.appointment);
	                        addField("Record type", data.recordType);
	                        addSection("Summary");
	                        addBody(data.summary);
	                      } else if (data.type === "sick-leave") {
	                        addTitle(
	                          "Sick Leave Certificate",
	                          data.patient ? "Issued for " + data.patient : "",
	                          data.date ? data.date + " · " + safeText(data.doctor) : safeText(data.doctor)
	                        );
	                        addSection("Certificate Details");
	                        addField("Patient", data.patient);
	                        addField("Doctor", data.doctor);
	                        addField("Issue date", data.date);
	                        addField("Start date", data.startDate);
	                        addField("End date", data.endDate);
	                        addField("Diagnosis", data.diagnosis);
	                        if (data.note) {
	                          addSection("Notes");
	                          addBody(data.note);
	                        }
	                      } else if (data.type === "imaging-report") {
	                        addTitle(
	                          "Imaging Report",
	                          data.patient ? "Report for " + data.patient : "",
	                          data.date ? data.date + " · " + safeText(data.doctor) : safeText(data.doctor)
	                        );
	                        addSection("Study");
	                        addField("Patient", data.patient);
	                        addField("Doctor", data.doctor);
	                        addField("Report date", data.date);
	                        addField("Modality", data.modality);
	                        addField("Study date", data.studyDate);
	                        addSection("Findings");
	                        addBody(data.findings);
	                        addSection("Impression");
	                        addBody(data.impression);
	                        if (data.attachments && data.attachments.length) {
	                          addSection("Attachments");
	                          for (var i = 0; i < data.attachments.length; i++) {
	                            addField("File " + (i + 1), data.attachments[i]);
	                          }
	                        }
	                      }

                      Api.Save();
                    } catch (e) {
                      console.error("Doctor editor command failed", e);
                    }
                  });
                } catch (e) {
                  console.error("Doctor editor callback failed", e);
                }
              `
              );
              frameInstance.executeInEditor(callback);
              // Give the editor time to execute `Api.Save()`.
              setTimeout(() => finish(resolve), 6500);
            },
            onAppError: () => {
              setTimeout(() => finish(() => reject(new Error("Editor app error"))), 500);
            }
          }
        });
        editorRef.current = instance;
        // Safety timeout.
        setTimeout(() => finish(resolve), 15000);
      } catch (error) {
        setMessage(error.message || "Failed to run editor");
        finish(() => reject(error));
      }
    });
  };

  const openPatient = (roomId) => {
    setSelectedRoomId(roomId);
    setView("doctor-patient");
  };

  const resolveRoomIdForAppointment = (appointment) => {
    const direct = String(appointment?.roomId || "").trim();
    if (direct && rooms.some((room) => room.id === direct)) return direct;

    const name = String(appointment?.patientName || appointment?.patient || "").trim().toLowerCase();
    if (name) {
      const exact = rooms.find((room) => String(room.patientName || "").trim().toLowerCase() === name);
      if (exact?.id) return exact.id;
      const contains = rooms.find((room) => String(room.patientName || "").trim().toLowerCase().includes(name));
      if (contains?.id) return contains.id;
    }

    return direct;
  };

  const openRecordFromAppointment = (appointment) => {
    const resolvedRoomId = resolveRoomIdForAppointment(appointment);
    if (!resolvedRoomId) return;
    if (!rooms.some((room) => room.id === resolvedRoomId)) {
      setMessage("Patient room not found for this appointment. Select the patient from the list first.");
      return;
    }
    setSelectedRoomId(resolvedRoomId);
    setView("doctor-schedule");

    setBusy(true);
    setMessage("");
    createMedicalRecord(resolvedRoomId, {
      appointmentId: appointment.id,
      date: appointment.date || "",
      patientName: appointment.patientName || appointment.patient || appointment.patientFullName || ""
    })
      .then((file) => {
        if (file?.openUrl) {
          openDoc(file.title || "Medical record", withFillAction(file.openUrl));
        }
        setMessage(file?.title ? `Medical record created: ${file.title}` : "Medical record created");
        return getDoctorRoomSummary(resolvedRoomId)
          .then((data) => setSummary(data))
          .catch(() => null);
      })
      .catch((error) => {
        setMessage(error.message || "Failed to create medical record");
      })
      .finally(() => setBusy(false));
  };

  const openDoc = (title, url) => {
    if (!url) return;
    setDocModal({
      open: true,
      title: title || "Document",
      url
    });
  };

  const withFillAction = (url) => {
    const raw = String(url || "");
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.searchParams.set("action", "fill");
      return parsed.toString();
    } catch {
      return raw.includes("?") ? `${raw}&action=fill` : `${raw}?action=fill`;
    }
  };

  const handleDocModalClose = () => {
    setDocModal({ open: false, title: "", url: "" });
    if (view === "doctor-fill-sign" && selectedRoomId) {
      loadFillItems(selectedRoomId, fillTab);
      setTimeout(() => loadFillItems(selectedRoomId, fillTab), 1500);
    }
    if (view === "doctor-inbox") {
      loadInbox();
      setTimeout(() => loadInbox(), 1500);
    }
  };

  const handleTemplateSelect = async (file) => {
    if (!selectedRoomId || !file?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const destTitle = labForm.title.trim() || file.title || "Lab result";
      await copyLabResultFromDocSpace(selectedRoomId, {
        fileId: file.id,
        title: destTitle
      });
      const data = await getDoctorRoomSummary(selectedRoomId);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoomId, "Lab Results");
      setLabResults(contents.items || []);
      setLabModalOpen(false);
      setLabMode("local");
      setLabForm({ title: "" });
      setTemplatesQuery("");
      setMessage(`Lab result copied: ${destTitle}`);
    } catch (error) {
      setMessage(error.message || "Failed to copy file");
    } finally {
      setBusy(false);
    }
  };

  const handleFillRequest = async (file) => {
    if (busy) return;
    if (!selectedRoomId || !file?.id) return;
    setBusy(true);
    setMessage("");
    try {
      await requestFillSign(selectedRoomId, { fileId: file.id });
      setFillModalOpen(false);
      setMessage(`Request sent: ${file.title}`);
      setTemplatesQuery("");
      setFillError("");
      await loadFillItems(selectedRoomId, fillTab);
    } catch (error) {
      setFillError(error.message || "Failed to request signature");
    } finally {
      setBusy(false);
    }
  };

  const loadFillItems = async (roomId, tab) => {
    if (!roomId) return;
    try {
      setFillLoading(true);
      setFillError("");
      const [actionContents, completedContents] = await Promise.all([
        getDoctorFillSignContents(roomId, "action"),
        getDoctorFillSignContents(roomId, "completed")
      ]);

      const actionFiles = (actionContents?.items || []).filter((item) => item.type === "file");
      const completedFiles = (completedContents?.items || []).filter((item) => item.type === "file");
      setFillCounts({ action: actionFiles.length, completed: completedFiles.length });

      setFillItems(tab === "completed" ? completedFiles : actionFiles);
    } catch (error) {
      setFillError(error.message || "Failed to load Fill & Sign files");
      setFillItems([]);
      setFillCounts({ action: 0, completed: 0 });
    } finally {
      setFillLoading(false);
    }
  };

  const handleLabUpload = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true);
    setMessage("");
    try {
      const fromFile = labFile?.name ? labFile.name.replace(/\.[^.]+$/, "") : "";
      const safeTitle =
        labForm.title.trim() || fromFile || `Lab result ${new Date().toISOString().slice(0, 10)}`;
      const file = await createLabResult(selectedRoom.id, { title: safeTitle });
      setLabForm({ title: "" });
      setLabFile(null);
      setLabMode("local");
      setLabModalOpen(false);
      setMessage(file?.title ? `Lab file created: ${file.title}` : "Lab file created");
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoom.id, "Lab Results");
      setLabResults(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to create lab result");
    } finally {
      setBusy(false);
    }
  };

  const handleImagingUpload = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    if (!imagingUploadFile) return;
    setBusy(true);
    setMessage("");
    try {
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

      await uploadImagingFile(selectedRoom.id, {
        file: {
          fileName: imagingUploadFile.name,
          base64,
          contentType: imagingUploadFile.type || "application/octet-stream"
        }
      });

      setImagingUploadFile(null);
      setImagingUploadOpen(false);
      setMessage("Imaging file uploaded.");
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoom.id, "Imaging");
      if (activeFolderTitle === "Imaging") {
        setActiveFolderItems(contents.items || []);
      }
    } catch (error) {
      setMessage(error.message || "Failed to upload imaging file");
    } finally {
      setBusy(false);
    }
  };

  const handleSickLeaveGenerate = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true);
    setMessage("");
    try {
      const patient = selectedRoom?.patientName || "Patient";
      const today = new Date().toISOString().slice(0, 10);
      const titleBase = `Sick Leave Certificate - ${today} - ${patient}`.replace(/\s+/g, " ").trim();
      const file = await createRoomDocument(selectedRoom.id, { folderTitle: "Sick Leave", title: titleBase });
      if (!file?.requestToken && !file?.shareToken) {
        throw new Error("Share token missing for generated document");
      }
      await runHiddenEditor(file, {
        type: "sick-leave",
        patient,
        doctor: doctor?.name || doctor?.email || "Doctor",
        date: today,
        startDate: sickLeaveForm.startDate || "",
        endDate: sickLeaveForm.endDate || "",
        diagnosis: sickLeaveForm.diagnosis || "",
        note: sickLeaveForm.note || ""
      });
      setSickLeaveOpen(false);
      setSickLeaveForm({ startDate: "", endDate: "", diagnosis: "", note: "" });
      if (file?.openUrl) {
        openDoc(file.title || "Sick leave certificate", file.openUrl);
      }
      const contents = await getDoctorFolderContents(selectedRoom.id, "Sick Leave");
      if (activeFolderTitle === "Sick Leave") {
        setActiveFolderItems(contents.items || []);
      }
    } catch (error) {
      setMessage(error.message || "Failed to generate sick leave certificate");
    } finally {
      setBusy(false);
    }
  };

  const handleImagingPackageGenerate = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true);
    setMessage("");
    try {
      const files = Array.isArray(imagingPackageFiles) ? imagingPackageFiles : [];
      const maxBytes = 15 * 1024 * 1024;
      for (const file of files) {
        if (file.size > maxBytes) {
          throw new Error(`File too large (${file.size} bytes). Max is ${maxBytes} bytes.`);
        }
      }

      const readAsBase64 = (file) =>
        new Promise((resolve, reject) => {
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
          reader.readAsDataURL(file);
        });

      const payloadFiles = [];
      for (const file of files) {
        payloadFiles.push({
          fileName: file.name,
          base64: await readAsBase64(file),
          contentType: file.type || "application/octet-stream"
        });
      }

      const result = await createImagingPackage(selectedRoom.id, {
        report: { ...imagingReportForm },
        files: payloadFiles
      });

      const reportFile = result?.reportFile || null;
      const uploadedTitles = (result?.uploadedFiles || []).map((f) => f.title).filter(Boolean);
      if (reportFile?.requestToken || reportFile?.shareToken) {
        await runHiddenEditor(reportFile, {
          type: "imaging-report",
          patient: selectedRoom?.patientName || "Patient",
          doctor: doctor?.name || doctor?.email || "Doctor",
          date: new Date().toISOString().slice(0, 10),
          ...imagingReportForm,
          attachments: uploadedTitles
        });
      }

      setImagingPackageOpen(false);
      setImagingPackageFiles([]);
      setImagingReportForm({ modality: "", studyDate: "", findings: "", impression: "" });

      if (reportFile?.openUrl) {
        openDoc(reportFile.title || "Imaging report", reportFile.openUrl);
      }

      const stack = Array.isArray(folderStack) ? folderStack : [];
      const current = stack.at(-1);
      if (current?.id) {
        const contents = await getDoctorFolderContentsById(current.id);
        setActiveFolderItems(contents.items || []);
      } else {
        const contents = await getDoctorFolderContents(selectedRoom.id, "Imaging");
        setActiveFolderItems(contents.items || []);
      }
    } catch (error) {
      setMessage(error.message || "Failed to create imaging study");
    } finally {
      setBusy(false);
    }
  };

  const handlePrescription = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await createPrescription(selectedRoom.id, rxForm);
      const file = result?.file || null;
      const payload = buildPrescriptionPayload({
        payload: result?.payload || null,
        patient: selectedRoom,
        doctor
      });
      if (file?.requestToken || file?.shareToken) {
        await runHiddenEditor(file, payload);
      }
      setRxForm({ medication: "", dosage: "", instructions: "" });
      setRxModalOpen(false);
      setMessage(file?.title ? `Prescription created: ${file.title}` : "Prescription created");
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoom.id, "Lab Results");
      setLabResults(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to create prescription");
    } finally {
      setBusy(false);
    }
  };

  const handleMedicalRecord = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    setBusy(true);
    setMessage("");
    try {
      const appointment = patientAppointments.find((item) => item.id === recordForm.appointmentId) || null;
      const file = await createMedicalRecord(selectedRoom.id, {
        appointmentId: appointment?.id || recordForm.appointmentId || null,
        date: appointment?.date || recordForm.date || "",
        patientName: selectedRoom.patientName || ""
      });
      setRecordModalOpen(false);
      setMessage(file?.title ? `Medical record created: ${file.title}` : "Medical record created");
      if (file?.openUrl) {
        openDoc(file.title || "Medical record", withFillAction(file.openUrl));
      }
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
    } catch (error) {
      setMessage(error.message || "Failed to create medical record");
    } finally {
      setBusy(false);
    }
  };

  const loadInbox = async (tabOverride) => {
    try {
      setInboxLoading(true);
      setInboxError("");
      const tabValue = String(tabOverride || inboxTab || "action").toLowerCase();
      const { contents, counts } = await getDoctorIncomingFillSign(tabValue);
      const files = (contents?.items || [])
        .filter((item) => item?.type === "file")
        .map((item) => ({
          assignmentId: item.assignmentId || item.id || null,
          templateFileId: item.templateFileId || null,
          title: item.title || "Form",
          openUrl: item.openUrl || "",
          status: item.status || "action",
          created: item.created || null,
          patientName: item.patientName || "Patient",
          patientRoomId: item.patientRoomId || ""
        }));
      setInboxItems(files);
      setInboxCounts(counts || { action: 0, completed: 0 });
    } catch (error) {
      setInboxError(error?.message || "Failed to load incoming statements");
      setInboxItems([]);
      setInboxCounts({ action: 0, completed: 0 });
    } finally {
      setInboxLoading(false);
    }
  };

  const handleGenericDocument = async (event) => {
    event.preventDefault();
    if (!selectedRoom) return;
    const folderTitle = String(activeFolderTitle || "").trim();
    if (!folderTitle) return;
    setBusy(true);
    setMessage("");
    try {
      const title = String(docCreateForm.title || "").trim();
      if (!title) {
        throw new Error("Title is required");
      }
      const file = await createRoomDocument(selectedRoom.id, { folderTitle, title });
      setDocCreateModalOpen(false);
      setDocCreateForm({ title: "" });
      setMessage(file?.title ? `Document created: ${file.title}` : "Document created");
      if (file?.openUrl) {
        openDoc(file.title || "Document", file.openUrl);
      }
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoom.id, folderTitle);
      setActiveFolderItems(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to create document");
    } finally {
      setBusy(false);
    }
  };

  const topbar = getTopbarProps({ view, selectedRoom, dateFilter, onDateFilter: setDateFilter });

  return (
    <div className="dashboard-layout doctor-layout">
      <DoctorSidebar
        doctor={doctor}
        active={view}
        hasPatient={Boolean(selectedRoom)}
        onNavigate={(next) => {
          if (next === "doctor-patient" && !selectedRoom) return;
          setView(next);
        }}
        onExit={onExit}
      />
      <main>
        <DoctorTopbar {...topbar} />

        {view === "doctor-schedule" && (
          <section className="panel">
            <p className="muted">Click an appointment to create a medical record.</p>
            <div className="doctor-schedule">
              {scheduledAppointments.length === 0 && <p className="muted">No appointments on this date.</p>}
              {scheduledAppointments.map((item) => (
                <article key={item.id} className="appointment-card doctor-appointment">
                  <div>
                    <h4>
                      {item.time || "--:--"} - {item.patientName}
                    </h4>
                    <p className="muted">Room: {item.roomTitle}</p>
                    {item.reason && <p className="muted">Reason: {item.reason}</p>}
                    {item.ticket?.url && (
                      <p className="muted">
                        Ticket:{" "}
                        <button
                          className="link"
                          type="button"
                          onClick={() => openDoc(item.ticket?.title, item.ticket.url)}
                        >
                          Open ticket
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="appointment-meta">
                    <span className={`status-pill ${String(item.status || "").toLowerCase()}`}>
                      {item.status}
                    </span>
                    <button className="secondary" type="button" onClick={() => openRecordFromAppointment(item)}>
                      Medical record
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "doctor-patients" && (
          <section className="panel">
            <div className="doctor-search-row">
              <div className="doctor-search">
                <input
                  type="search"
                  placeholder="Search patients..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="doctor-patients-grid">
              {filteredRooms.map((room) => (
                <article key={room.id} className="record-card doctor-patient-card">
                  <div className="doctor-patient-head">
                    <h4 className="record-title">{room.patientName}</h4>
                    {room.lastVisit && <span className="doctor-last-visit">{room.lastVisit}</span>}
                  </div>
                  <div className="record-actions">
                    <button className="primary" type="button" onClick={() => openPatient(room.id)}>
                      Open patient
                    </button>
                  </div>
                </article>
              ))}
              {filteredRooms.length === 0 && <p className="muted">No patient rooms found.</p>}
            </div>
          </section>
        )}

	        {view === "doctor-patient" && selectedRoom && (
	          <section className="panel">
            <div className="panel-head">
              <div className="record-actions doctor-quick-actions">
                <button className="secondary" type="button" onClick={() => setView("doctor-patients")}>
                  Back to patients
                </button>
              </div>
            </div>

            <div className="folder-grid doctor-folder-grid">
              {doctorFolders.map((folder) => (
                <FolderTile
                  key={folder.id}
                  title={folder.title}
                  description={folder.description}
                  count={folder.count}
                  icon={folder.icon}
                  onClick={() => handleDoctorFolderClick(folder)}
                />
              ))}
            </div>

	            {activeFolderTitle && (
	              <div className="doctor-section doctor-active-folder">
	                <div className="panel-head">
	                  <div>
	                    <h3>{folderStack.length ? folderStack.map((f) => f.title).join(" / ") : activeFolderTitle}</h3>
	                    <p className="muted">Browse files in this folder.</p>
	                  </div>
	                  <div className="record-actions">
	                    <button className="secondary" type="button" onClick={goFolderBack}>
	                      {folderStack.length > 1 ? "Back" : "Back to folders"}
	                    </button>
                    {isLabFolderActive && (
                      <button className="primary" type="button" onClick={() => setLabModalOpen(true)}>
                        Upload lab result
                      </button>
                    )}
                    {isPrescriptionFolderActive && (
                      <button className="primary" type="button" onClick={() => setRxModalOpen(true)}>
                        Create prescription
                      </button>
                    )}
                    {isSickLeaveFolderActive && (
                      <button className="primary" type="button" onClick={() => setSickLeaveOpen(true)}>
                        Generate sick leave
                      </button>
                    )}
                    {isGenericDocFolderActive && (
                      <button
                        className="primary"
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          const patient = selectedRoom?.patientName || "Patient";
                          const base = `${activeFolderTitle} - ${today} - ${patient}`.replace(/\s+/g, " ").trim();
                          setDocCreateForm({ title: base });
                          setDocCreateModalOpen(true);
                        }}
                      >
                        Create document
                      </button>
                    )}
	                    {isImagingFolderActive && (
	                      <>
	                        <button className="primary" type="button" onClick={() => setImagingPackageOpen(true)}>
	                          New study
	                        </button>
	                        <button className="secondary" type="button" onClick={() => setImagingUploadOpen(true)}>
	                          Upload imaging file
	                        </button>
	                      </>
	                    )}
	                  </div>
	                </div>
                {activeFolderLoading && <p className="muted">Loading folder contents...</p>}
                {!activeFolderLoading && activeFolderItems.length === 0 && (
                  <p className="muted">No files yet.</p>
                )}
	                <ul className="content-list doctor-files">
	                  {activeFolderItems.map((item) => (
	                    <li
	                      key={`active-${item.id}`}
	                      className={`content-item ${item.type}`}
	                      onClick={() => {
	                        if (item.type === "folder") {
	                          openFolderById({ id: item.id, title: item.title });
	                          return;
	                        }
	                        openActiveFolderItem(item);
	                      }}
	                    >
	                      <span className="content-icon" />
	                      <span>{item.title}</span>
	                    </li>
	                  ))}
	                </ul>
	              </div>
	            )}

            {!activeFolderTitle && (
              <div id="doctor-lab-results" className="doctor-section">
              <div className="panel-head">
                <div>
                  <h3>Lab Results</h3>
                  <p className="muted">Files already uploaded for this patient.</p>
                </div>
                <button className="secondary" type="button" onClick={() => setLabModalOpen(true)}>
                  Upload lab result
                </button>
              </div>
              {labLoading && <p className="muted">Loading lab results...</p>}
              {!labLoading && labResults.length === 0 && (
                <p className="muted">No lab files yet.</p>
              )}
              <ul className="content-list doctor-files">
                {labResults
                  .filter((item) => item.type === "file")
                  .map((item) => (
                    <li
                      key={`lab-${item.id}`}
                      className={`content-item ${item.type}`}
                      onClick={() => {
                        if (item.openUrl) {
                          openDoc(item.title, item.openUrl);
                        }
                      }}
                    >
                      <span className="content-icon" />
                      <span>{item.title}</span>
                    </li>
                  ))}
              </ul>
            </div>
            )}
          </section>
	        )}

	        {view === "doctor-inbox" && (
	          <section className="panel">
	            <div className="panel-head">
	              <div>
	                <h3>Incoming statements</h3>
	                <p className="muted">Forms started by patients from Client Templates.</p>
	              </div>
	              <div className="panel-tabs fill-tabs">
	                <button
	                  type="button"
	                  className={`tab-pill ${inboxTab === "action" ? "active" : ""}`}
	                  onClick={() => setInboxTab("action")}
	                >
	                  Requires action <span className="tab-count">{inboxCounts.action}</span>
	                </button>
	                <button
	                  type="button"
	                  className={`tab-pill ${inboxTab === "completed" ? "active" : ""}`}
	                  onClick={() => setInboxTab("completed")}
	                >
	                  Completed <span className="tab-count">{inboxCounts.completed}</span>
	                </button>
	                <button className="secondary" type="button" onClick={() => loadInbox()} disabled={inboxLoading}>
	                  Refresh
	                </button>
	              </div>
	            </div>

	            {inboxError && <p className="error-banner">Error: {inboxError}</p>}
	            {inboxLoading && <p className="muted">Loading...</p>}
	            {!inboxLoading && inboxItems.length === 0 && <p className="muted">No incoming statements yet.</p>}

	            {!inboxLoading && inboxItems.length > 0 && (
	              <div className="fill-grid">
	                {inboxItems.map((item, idx) => (
	                  <article key={item.assignmentId || `${item.title}-${idx}`} className="fill-card">
	                    <div
	                      className={`fill-thumb fill-thumb-${
	                        item.status === "completed" ? "completed" : "action"
	                      }`}
	                    />
	                    <div className="fill-body">
	                      <h4>{item.title}</h4>
	                      <p className="muted">Patient: {item.patientName}</p>
	                      <p className="muted">{item.status === "completed" ? "Completed" : "In progress"}</p>
	                      <div className="fill-actions">
	                        <button
	                          className={item.status === "completed" ? "secondary" : "primary"}
	                          type="button"
	                          onClick={() => openDoc(item.title, item.openUrl)}
	                          disabled={!item.openUrl}
	                        >
	                          {item.status === "completed" ? "View" : "Open"}
	                        </button>
	                      </div>
	                    </div>
	                  </article>
	                ))}
	              </div>
	            )}
	          </section>
	        )}

	        {view === "doctor-fill-sign" && (
	          <section className="panel">
	            <div className="fill-sign-actions">
	              <button className="primary" type="button" onClick={() => setFillModalOpen(true)}>
                Request signature
              </button>
            </div>

            <div className="fill-sign-layout">
              <div className="fill-sign-patients">
                <div className="panel-head">
                  <div>
                    <h4>Patients</h4>
                  </div>
                  <div className="doctor-search">
                    <input
                      type="search"
                      placeholder="Search patients..."
                      value={fillPatientQuery}
                      onChange={(e) => setFillPatientQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="patient-list">
                  {filteredFillRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={`patient-pill ${selectedRoomId === room.id ? "active" : ""}`}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      <strong>{room.patientName}</strong>
                    </button>
                  ))}
                  {filteredFillRooms.length === 0 && <p className="muted">No patients found.</p>}
                </div>
              </div>
              <div className="fill-sign-documents">
                <div className="panel-tabs fill-tabs">
                  <button
                    type="button"
                    className={`tab-pill ${fillTab === "action" ? "active" : ""}`}
                    onClick={() => setFillTab("action")}
                  >
                    Requires action <span className="tab-count">{fillCounts.action}</span>
                  </button>
                  <button
                    type="button"
                    className={`tab-pill ${fillTab === "completed" ? "active" : ""}`}
                    onClick={() => setFillTab("completed")}
                  >
                    Completed <span className="tab-count">{fillCounts.completed}</span>
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => selectedRoomId && loadFillItems(selectedRoomId, fillTab)}
                    disabled={!selectedRoomId || fillLoading}
                  >
                    Refresh
                  </button>
                </div>
                {!selectedRoomId && <p className="muted">Select a patient to see their forms.</p>}
                {fillError && <p className="error-banner">Error: {fillError}</p>}
                {fillLoading && <p className="muted">Loading forms...</p>}
                {!fillLoading && selectedRoomId && (
                  <>
                    {fillItems.length === 0 ? (
                      <p className="muted">No documents in this section yet.</p>
                    ) : (
                      <div className="fill-grid">
                        {fillItems.map((file, index) => (
                          <article key={file.assignmentId || `${file.id || "file"}-${index}`} className="fill-card">
                            <div className={`fill-thumb fill-thumb-${fillTab === "action" ? "action" : "completed"}`} />
                            <div className="fill-body">
                              <h4>{file.title}</h4>
                              <p className="muted">
                                {fillTab === "action" ? "Waiting for patient signature" : "Completed"}
                              </p>
                              <p className="muted">Initiated by: {file.initiatedByName || "Clinic"}</p>
                              <div className="fill-actions">
                                <button
                                  className={fillTab === "action" ? "primary" : "secondary"}
                                  type="button"
                                  onClick={() => openDoc(file.title, file.openUrl)}
                                >
                                  View
                                </button>
                                {fillTab === "action" && canCancelFillSignItem(file) && (
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={async () => {
                                      if (busy) return;
                                      const aid = String(file.assignmentId || "").trim();
                                      if (!aid || !selectedRoomId) return;
                                      const ok = window.confirm("Cancel this request? It will disappear for the patient too.");
                                      if (!ok) return;
                                      setBusy(true);
                                      setFillError("");
                                      try {
                                        await cancelDoctorFillSignRequest(selectedRoomId, aid);
                                        await loadFillItems(selectedRoomId, fillTab);
                                      } catch (error) {
                                        setFillError(error.message || "Failed to cancel request");
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {labModalOpen && selectedRoom && (
          <Modal title="Upload lab result" onClose={() => setLabModalOpen(false)}>
            <div className="mode-toggle" role="tablist" aria-label="Lab upload mode">
              <button
                className={`mode-pill ${labMode === "local" ? "active" : ""}`}
                type="button"
                onClick={() => setLabMode("local")}
              >
                Upload from local storage
              </button>
                <button
                  className={`mode-pill ${labMode === "docspace" ? "active" : ""}`}
                  type="button"
                  onClick={() => setLabMode("docspace")}
                >
                Upload
                </button>
            </div>

            {labMode === "local" ? (
              <form className="auth-form" onSubmit={handleLabUpload}>
                <div className="file-input-block">
                  <span className="file-input-label">Choose file</span>
                  <div className="file-input-row">
                    <input
                      id="lab-file-input"
                      className="file-input-hidden"
                      type="file"
                      onChange={(e) => setLabFile(e.target.files?.[0] || null)}
                    />
                    <label className="file-input-button" htmlFor="lab-file-input">
                      Browse files
                    </label>
                    <span className="file-input-name">{labFile?.name || "No file selected"}</span>
                  </div>
                </div>
                <label>
                  File name (optional)
                  <input
                    type="text"
                    placeholder={labFile?.name ? labFile.name.replace(/\.[^.]+$/, "") : "CBC results"}
                    value={labForm.title}
                    onChange={(e) => setLabForm({ title: e.target.value })}
                  />
                </label>
                <button className="primary" type="submit" disabled={busy}>
                  Upload
                </button>
              </form>
            ) : (
              <div className="docspace-picker">
                <p className="muted">
                  Choose a file to copy into this patient's Lab Results.
                </p>
                <div className="search-row">
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={templatesQuery}
                    onChange={(e) => setTemplatesQuery(e.target.value)}
                  />
                </div>
                {templatesError && <p className="muted">{templatesError}</p>}
                {templatesLoading && <p className="muted">Loading files...</p>}
                {!templatesLoading && !templatesError && (
                  <div className="template-list">
                    {filteredTemplates.length === 0 ? (
                      <p className="muted">No files found.</p>
                    ) : (
                      filteredTemplates.map((file) => (
                        <button
                          key={file.id}
                          className="template-item"
                          type="button"
                          onClick={() => handleTemplateSelect(file)}
                        >
                          <span className="content-icon" />
                          <span className="template-name">{file.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="record-actions">
                  <button className="secondary" type="button" onClick={() => setLabMode("local")}>
                    Use local upload
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {imagingUploadOpen && selectedRoom && (
          <Modal
            title="Upload imaging file"
            onClose={() => {
              setImagingUploadOpen(false);
              setImagingUploadFile(null);
            }}
          >
            <form className="auth-form" onSubmit={handleImagingUpload}>
              <div className="file-input-block">
                <span className="file-input-label">Choose file</span>
                <div className="file-input-row">
                  <input
                    id="imaging-file-input"
                    className="file-input-hidden"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.dcm,application/pdf,image/*"
                    onChange={(e) => setImagingUploadFile(e.target.files?.[0] || null)}
                  />
                  <label className="file-input-button" htmlFor="imaging-file-input">
                    Browse files
                  </label>
                  <span className="file-input-name">{imagingUploadFile?.name || "No file selected"}</span>
                </div>
              </div>
              <button className="primary" type="submit" disabled={busy || !imagingUploadFile}>
                Upload
              </button>
            </form>
          </Modal>
        )}

        
	        {imagingPackageOpen && selectedRoom && (
	          <Modal
	            title="New imaging study"
	            onClose={() => {
	              setImagingPackageOpen(false);
	              setImagingPackageFiles([]);
	            }}
	          >
	            <form className="auth-form" onSubmit={handleImagingPackageGenerate}>
	              <div className="file-input-block">
	                <span className="file-input-label">Imaging files</span>
	                <div className="file-input-row">
	                  <input
	                    id="imaging-package-files"
	                    className="file-input-hidden"
	                    type="file"
	                    multiple
	                    accept=".pdf,.png,.jpg,.jpeg,.dcm,application/pdf,image/*"
	                    onChange={(e) => setImagingPackageFiles(Array.from(e.target.files || []))}
	                  />
	                  <label className="file-input-button" htmlFor="imaging-package-files">
	                    Browse files
	                  </label>
	                  <span className="file-input-name">
	                    {imagingPackageFiles.length ? `${imagingPackageFiles.length} file(s) selected` : "No files selected"}
	                  </span>
	                </div>
	              </div>
	              <label>
	                Modality
	                <input
	                  type="text"
	                  placeholder="MRI / CT / X-ray / Ultrasound"
	                  value={imagingReportForm.modality}
	                  onChange={(e) => setImagingReportForm({ ...imagingReportForm, modality: e.target.value })}
	                  required
	                />
	              </label>
	              <label>
	                Study date (optional)
	                <input
	                  type="date"
	                  lang="en-US"
	                  value={imagingReportForm.studyDate}
	                  onChange={(e) => setImagingReportForm({ ...imagingReportForm, studyDate: e.target.value })}
	                />
	              </label>
	              <label>
	                Findings
	                <textarea
	                  rows="4"
	                  placeholder="Describe findings"
	                  value={imagingReportForm.findings}
	                  onChange={(e) => setImagingReportForm({ ...imagingReportForm, findings: e.target.value })}
	                  required
	                />
	              </label>
	              <label>
	                Impression
	                <textarea
	                  rows="3"
	                  placeholder="Summary / impression"
	                  value={imagingReportForm.impression}
	                  onChange={(e) => setImagingReportForm({ ...imagingReportForm, impression: e.target.value })}
	                  required
	                />
	              </label>
	              <button className="primary" type="submit" disabled={busy}>
	                Create study
	              </button>
	            </form>
	          </Modal>
	        )}

        {sickLeaveOpen && selectedRoom && (
          <Modal
            title="Generate sick leave certificate"
            onClose={() => {
              setSickLeaveOpen(false);
              setSickLeaveForm({ startDate: "", endDate: "", diagnosis: "", note: "" });
            }}
          >
            <form className="auth-form" onSubmit={handleSickLeaveGenerate}>
              <label>
                Start date
                <input
                  type="date"
                  lang="en-US"
                  value={sickLeaveForm.startDate}
                  onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, startDate: e.target.value })}
                  required
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  lang="en-US"
                  value={sickLeaveForm.endDate}
                  onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, endDate: e.target.value })}
                />
              </label>
              <label>
                Diagnosis (optional)
                <input
                  type="text"
                  placeholder="Diagnosis"
                  value={sickLeaveForm.diagnosis}
                  onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, diagnosis: e.target.value })}
                />
              </label>
              <label>
                Note (optional)
                <textarea
                  rows="3"
                  placeholder="Any additional notes"
                  value={sickLeaveForm.note}
                  onChange={(e) => setSickLeaveForm({ ...sickLeaveForm, note: e.target.value })}
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                Generate
              </button>
            </form>
          </Modal>
        )}

        {rxModalOpen && selectedRoom && (
          <Modal title="Create prescription" onClose={() => setRxModalOpen(false)}>
            <form className="auth-form" onSubmit={handlePrescription}>
              <label>
                Medication
                <input
                  type="text"
                  placeholder="Amoxicillin"
                  value={rxForm.medication}
                  onChange={(e) => setRxForm({ ...rxForm, medication: e.target.value })}
                  required
                />
              </label>
              <label>
                Dosage
                <input
                  type="text"
                  placeholder="500 mg twice daily"
                  value={rxForm.dosage}
                  onChange={(e) => setRxForm({ ...rxForm, dosage: e.target.value })}
                />
              </label>
              <label>
                Instructions
                <textarea
                  rows="3"
                  placeholder="Take after meals for 7 days"
                  value={rxForm.instructions}
                  onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })}
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                Save prescription
              </button>
            </form>
          </Modal>
        )}

        {recordModalOpen && selectedRoom && (
          <Modal title="Medical record" onClose={() => setRecordModalOpen(false)}>
            <form className="auth-form" onSubmit={handleMedicalRecord}>
              <p className="muted">
                Creates a medical record document from the template and opens it in the editor.
              </p>
              <label>
                Appointment
                <select
                  value={recordForm.appointmentId}
                  onChange={(e) => setRecordForm({ ...recordForm, appointmentId: e.target.value })}
                >
                  <option value="">Select appointment</option>
                  {patientAppointments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.date} {item.time} - {item.patientName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  lang="en-US"
                  value={recordForm.date}
                  onChange={(e) => setRecordForm({ ...recordForm, date: e.target.value })}
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                Open editor
              </button>
            </form>
          </Modal>
        )}

        {docCreateModalOpen && selectedRoom && (
          <Modal
            title={activeFolderTitle ? `Create document \u2014 ${activeFolderTitle}` : "Create document"}
            onClose={() => setDocCreateModalOpen(false)}
          >
            <form className="auth-form" onSubmit={handleGenericDocument}>
              <p className="muted">
                Creates a new document in <strong>{activeFolderTitle || "the selected folder"}</strong> and opens it in the editor.
              </p>
              <label>
                Title
                <input
                  type="text"
                  value={docCreateForm.title}
                  onChange={(e) => setDocCreateForm({ title: e.target.value })}
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                Create & open
              </button>
            </form>
          </Modal>
        )}

        {fillModalOpen && (
          <Modal title="Request signature" onClose={() => setFillModalOpen(false)}>
            <div className="docspace-picker">
              <p className="muted">Select a document to send for patient signature.</p>
              <div className="search-row">
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templatesQuery}
                  onChange={(e) => setTemplatesQuery(e.target.value)}
                />
              </div>
              {templatesError && <p className="muted">{templatesError}</p>}
              {templatesLoading && <p className="muted">Loading templates...</p>}
              {!templatesLoading && !templatesError && (
                <div className="template-list">
                  {filteredTemplates.length === 0 ? (
                    <p className="muted">No templates found.</p>
                  ) : (
                    filteredTemplates.map((file) => (
                      <button
                        key={file.id}
                        className="template-item"
                        type="button"
                        disabled={busy}
                        onClick={() => handleFillRequest(file)}
                      >
                        <span className="content-icon" />
                        <span className="template-name">{file.title}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </Modal>
        )}

        <DocSpaceModal
          open={docModal.open}
          title={docModal.title}
          url={docModal.url}
          onClose={handleDocModalClose}
        />

      </main>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="panel-head modal-head">
          <h3>{title}</h3>
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function getTopbarProps({ view, selectedRoom, dateFilter, onDateFilter }) {
  if (view === "doctor-schedule") {
    return {
      title: "Doctor schedule",
      subtitle: "All appointments for the selected date.",
      dateFilter,
      onDateFilter
    };
  }
  if (view === "doctor-patients") {
    return {
      title: "Patients",
      subtitle: "Browse patient rooms."
    };
  }
  if (view === "doctor-fill-sign") {
    return {
      title: "Fill & Sign",
      subtitle: "Manage patient signature requests."
    };
  }
  if (view === "doctor-inbox") {
    return {
      title: "Incoming statements",
      subtitle: "Statements started by patients."
    };
  }
  return {
    title: selectedRoom ? selectedRoom.patientName : "Patient",
    subtitle: selectedRoom ? selectedRoom.title : "Select a patient room"
  };
}

function buildPrescriptionPayload({ payload, patient, doctor }) {
  const data = payload || {};
  return {
    type: "prescription",
    date: data.date || "-",
    doctor: doctor?.displayName || "Doctor",
    patient: patient?.patientName || "Patient",
    medication: data.medication || "-",
    dosage: data.dosage || "-",
    instructions: data.instructions || "-"
  };
}

function buildMedicalRecordPayload({ record, appointment, patient, doctor }) {
  return {
    type: "medical-record",
    date: record?.date || "-",
    recordType: record?.type || "Visit note",
    doctor: doctor?.displayName || "Doctor",
    patient: patient?.patientName || "Patient",
    appointment: appointment
      ? `${appointment.date || ""} ${appointment.time || ""}`.trim()
      : "-",
    summary: record?.description || "-"
  };
}
