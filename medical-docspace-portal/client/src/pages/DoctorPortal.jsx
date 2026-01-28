import { useEffect, useMemo, useRef, useState } from "react";

import DoctorSidebar from "../components/DoctorSidebar.jsx";
import DoctorTopbar from "../components/DoctorTopbar.jsx";
import FolderTile from "../components/FolderTile.jsx";
import folderStructure from "../data/folderStructure.js";
import {
  copyLabResultFromDocSpace,
  createLabResult,
  createMedicalRecord,
  createPrescription,
  getDoctorAppointments,
  getDoctorFolderContents,
  getDoctorRoomSummary,
  getDoctorRooms
} from "../services/doctorApi.js";

const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";
const editorFrameId = "doctor-hidden-editor";
const selectorFrameId = "doctor-file-selector-frame";

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

const folderMetaByTitle = new Map(
  folderStructure.map((item) => [normalizeTitle(item.title), item])
);

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}


export default function DoctorPortal({ doctor, onExit }) {
  const [view, setView] = useState("doctor-schedule");
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [summary, setSummary] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [labLoading, setLabLoading] = useState(false);
  const [activeFolderTitle, setActiveFolderTitle] = useState("");
  const [activeFolderItems, setActiveFolderItems] = useState([]);
  const [activeFolderLoading, setActiveFolderLoading] = useState(false);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [selectorError, setSelectorError] = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [appointments, setAppointments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [labModalOpen, setLabModalOpen] = useState(false);
  const [labMode, setLabMode] = useState("local");
  const [labFile, setLabFile] = useState(null);
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);

  const [labForm, setLabForm] = useState({ title: "" });
  const [rxForm, setRxForm] = useState({ medication: "", dosage: "", instructions: "" });
  const [recordForm, setRecordForm] = useState({
    appointmentId: "",
    type: "Visit note",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    summary: ""
  });

  const editorRef = useRef(null);
  const selectorInitedRef = useRef(false);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

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

  const handleDoctorFolderClick = async (folder) => {
    const name = folder?.title;
    if (!name || !selectedRoomId) return;
    setActiveFolderTitle(name);
    setActiveFolderItems([]);
    setActiveFolderLoading(true);
    try {
      const contents = await getDoctorFolderContents(selectedRoomId, name);
      setActiveFolderItems(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to load folder contents");
    } finally {
      setActiveFolderLoading(false);
    }
  };

  const openActiveFolderItem = (item) => {
    if (item?.type === "file" && item.openUrl) {
      window.open(item.openUrl, "_blank", "noopener,noreferrer");
    }
  };

  const isLabFolderActive = activeFolderTitle === "Lab Results";
  const isPrescriptionFolderActive = activeFolderTitle === "Prescriptions";

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
    if (!labModalOpen || labMode !== "docspace" || !selectedRoomId) return;
    let cancelled = false;

    const initSelector = async () => {
      try {
        setSelectorLoading(true);
        setSelectorError("");
        await loadDocSpaceSdk(docspaceUrl);
        if (cancelled) return;
        const sdk = window.DocSpace?.SDK;
        if (!sdk?.initFileSelector) {
          setSelectorError("DocSpace File Selector is not available.");
          setSelectorLoading(false);
          return;
        }
        const config = {
          src: docspaceUrl,
          requestToken: doctor?.token || undefined,
          frameId: selectorFrameId,
          width: "100%",
          height: "520px",
          events: {
            onAppReady: () => {
              if (!cancelled) setSelectorLoading(false);
            },
            onAppError: (error) => {
              if (cancelled) return;
              setSelectorError(error?.message || "File selector error");
              setSelectorLoading(false);
            },
            onSelectCallback: async (item) => {
              if (cancelled || !item?.id) return;
              setBusy(true);
              setMessage("");
              try {
                const destTitle = labForm.title.trim() || item.title || "Lab result";
                await copyLabResultFromDocSpace(selectedRoomId, {
                  fileId: item.id,
                  title: destTitle
                });
                const data = await getDoctorRoomSummary(selectedRoomId);
                setSummary(data);
                const contents = await getDoctorFolderContents(selectedRoomId, "Lab Results");
                setLabResults(contents.items || []);
                setLabModalOpen(false);
                setLabMode("local");
                setLabForm({ title: "" });
                setMessage(`Lab result copied: ${destTitle}`);
              } catch (error) {
                setMessage(error.message || "Failed to copy file");
              } finally {
                setBusy(false);
              }
            }
          }
        };
        sdk.initFileSelector(config);
        selectorInitedRef.current = true;
      } catch (error) {
        if (cancelled) return;
        setSelectorError(error.message || "Failed to initialize DocSpace selector");
        setSelectorLoading(false);
      }
    };

    initSelector();

    return () => {
      cancelled = true;
    };
  }, [labModalOpen, labMode, selectedRoomId, labForm.title]);

  useEffect(() => {
    if (labModalOpen) return;
    const frame = document.getElementById(selectorFrameId);
    if (frame) frame.innerHTML = "";
    selectorInitedRef.current = false;
    setSelectorError("");
    setSelectorLoading(false);
  }, [labModalOpen]);

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
    if (!file?.id || !file?.shareToken) return;
    if (!docspaceUrl) {
      setMessage("VITE_DOCSPACE_URL is not set.");
      return;
    }
    destroyEditor();
    try {
      await loadDocSpaceSdk(docspaceUrl);
      const instance = window.DocSpace?.SDK?.initEditor({
        src: docspaceUrl,
        id: String(file.id),
        frameId: editorFrameId,
        requestToken: file.shareToken,
        width: "1px",
        height: "1px",
        events: {
          onAppReady: () => {
            const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
            if (!frameInstance) {
              destroyEditor();
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
            setTimeout(() => destroyEditor(), 5000);
          },
          onAppError: () => {
            setTimeout(() => destroyEditor(), 500);
          }
        }
      });
      editorRef.current = instance;
    } catch (error) {
      setMessage(error.message || "Failed to run editor");
    }
  };

  const openPatient = (roomId) => {
    setSelectedRoomId(roomId);
    setView("doctor-patient");
  };

  const openRecordFromAppointment = (appointment) => {
    if (!appointment?.roomId) return;
    setSelectedRoomId(appointment.roomId);
    setView("doctor-schedule");
    setRecordForm((prev) => ({
      ...prev,
      appointmentId: appointment.id,
      date: appointment.date || prev.date,
      title: prev.title || `Visit summary - ${appointment.patientName}`
    }));
    setRecordModalOpen(true);
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
      if (file?.shareToken) {
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
      const record = await createMedicalRecord(selectedRoom.id, {
        ...recordForm,
        doctorName: doctor?.displayName || "Doctor"
      });
      const file = record?.document || null;
      const payload = buildMedicalRecordPayload({
        record,
        appointment,
        patient: selectedRoom,
        doctor
      });
      if (file?.shareToken) {
        await runHiddenEditor(file, payload);
      }
      setRecordForm({
        appointmentId: "",
        type: "Visit note",
        title: "",
        date: new Date().toISOString().slice(0, 10),
        summary: ""
      });
      setRecordModalOpen(false);
      setMessage(record?.title ? `Medical record created: ${record.title}` : "Medical record created");
      const data = await getDoctorRoomSummary(selectedRoom.id);
      setSummary(data);
      const contents = await getDoctorFolderContents(selectedRoom.id, "Lab Results");
      setLabResults(contents.items || []);
    } catch (error) {
      setMessage(error.message || "Failed to create medical record");
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

        {message && (
          <section className="panel">
            <p className="muted">{message}</p>
          </section>
        )}

        {view === "doctor-schedule" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Appointments</h3>
                <p className="muted">Click an appointment to create a medical record.</p>
              </div>
            </div>
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
                          onClick={() => window.open(item.ticket.url, "_blank", "noopener,noreferrer")}
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
            <p className="muted doctor-patients-hint">Open a patient room to manage documents.</p>
            <div className="doctor-patients-grid">
              {rooms.map((room) => (
                <article key={room.id} className="record-card doctor-patient-card">
                  <div className="record-meta">
                    <span className="record-type">Room</span>
                    <span className="record-date">{room.patientName}</span>
                  </div>
                  <h4 className="record-title">{room.title}</h4>
                  <div className="record-actions">
                    <button className="primary" type="button" onClick={() => openPatient(room.id)}>
                      Open patient
                    </button>
                    {room.url && (
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => window.open(room.url, "_blank", "noopener,noreferrer")}
                      >
                        Open DocSpace
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {rooms.length === 0 && <p className="muted">No patient rooms found.</p>}
            </div>
          </section>
        )}

        {view === "doctor-patient" && selectedRoom && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>{selectedRoom.patientName}</h3>
                <p className="muted">Manage this patient room.</p>
              </div>
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
                    <h3>{activeFolderTitle}</h3>
                    <p className="muted">Browse files in this folder.</p>
                  </div>
                  <div className="record-actions">
                    <button className="secondary" type="button" onClick={() => setActiveFolderTitle("")}>
                      Back to folders
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
                  </div>
                </div>
                {activeFolderLoading && <p className="muted">Loading folder contents...</p>}
                {!activeFolderLoading && activeFolderItems.length === 0 && (
                  <p className="muted">No files yet.</p>
                )}
                <ul className="content-list doctor-files">
                  {activeFolderItems
                    .filter((item) => item.type === "file")
                    .map((item) => (
                      <li
                        key={`active-${item.id}`}
                        className={`content-item ${item.type}`}
                        onClick={() => openActiveFolderItem(item)}
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
                          window.open(item.openUrl, "_blank", "noopener,noreferrer");
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
                Upload from DocSpace
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
                  Select any file in DocSpace. It will be copied into this patient's Lab Results.
                </p>
                {selectorError && <p className="muted">{selectorError}</p>}
                {selectorLoading && <p className="muted">Loading DocSpace selector...</p>}
                <div id={selectorFrameId} className="docspace-frame" />
                <div className="record-actions">
                  <button className="secondary" type="button" onClick={() => setLabMode("local")}>
                    Use local upload
                  </button>
                </div>
              </div>
            )}
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
                Type
                <input
                  type="text"
                  value={recordForm.type}
                  onChange={(e) => setRecordForm({ ...recordForm, type: e.target.value })}
                />
              </label>
              <label>
                Title
                <input
                  type="text"
                  placeholder="Visit summary"
                  value={recordForm.title}
                  onChange={(e) => setRecordForm({ ...recordForm, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={recordForm.date}
                  onChange={(e) => setRecordForm({ ...recordForm, date: e.target.value })}
                  required
                />
              </label>
              <label>
                Summary
                <textarea
                  rows="4"
                  placeholder="Clinical summary for the patient"
                  value={recordForm.summary}
                  onChange={(e) => setRecordForm({ ...recordForm, summary: e.target.value })}
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy}>
                Save medical record
              </button>
            </form>
          </Modal>
        )}

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
