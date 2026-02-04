import { useEffect, useMemo, useRef, useState } from "react";

import PatientShell from "../components/PatientShell.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import { createFileShareLink } from "../services/docspaceApi.js";



const storageKey = "medical.portal.appointments";

const docspaceUrl = import.meta.env.VITE_DOCSPACE_URL || "";

const editorFrameId = "appointment-ticket-editor-hidden";



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



function getAppointmentsKey(session) {

  const userId = session?.user?.docspaceId || "anon";

  const roomId = session?.room?.id || "room";

  return `${storageKey}.${userId}.${roomId}`;

}



function loadAppointments(session) {

  try {

    const raw = localStorage.getItem(getAppointmentsKey(session));

    return raw ? JSON.parse(raw) : [];

  } catch {

    return [];

  }

}



function saveAppointments(session, items) {

  localStorage.setItem(getAppointmentsKey(session), JSON.stringify(items));

}



export default function Appointments({ session, onLogout, onNavigate }) {

  const [items, setItems] = useState([]);
  const submitRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({

    date: "",

    time: "",

    doctor: "",

    reason: ""

  });

  const [doctorInfo, setDoctorInfo] = useState(null);

  const [message, setMessage] = useState("");

  const [ticketMessage, setTicketMessage] = useState("");
  const [shareModal, setShareModal] = useState({ open: false, title: "", link: "", loading: false, error: "" });
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });

  const editorRef = useRef(null);

  const ensureRoomId = async () => {
    if (session?.room?.id) return session.room.id;
    const fullName =
      session?.user?.fullName || session?.user?.displayName || session?.user?.name || "Patient";
    const response = await fetch("/api/patients/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "Patient room is missing");
    }
    const room = data?.room || null;
    if (room?.id) {
      try {
        const raw = localStorage.getItem("medical.portal.session");
        if (raw) {
          const parsed = JSON.parse(raw);
          const nextSession = {
            ...(parsed?.session || session || {}),
            room: {
              id: room.id,
              name: room.title || room.name || `${fullName} - Patient Room`,
              url: room.webUrl || room.url || ""
            }
          };
          localStorage.setItem(
            "medical.portal.session",
            JSON.stringify({ session: nextSession, view: parsed?.view || "dashboard" })
          );
        }
      } catch {
        // ignore storage errors
      }
      return room.id;
    }
    throw new Error("Patient room is missing");
  };



  useEffect(() => {

    const loadDoctor = async () => {

      try {

        const response = await fetch("/api/patients/doctor");

        const data = await response.json();

        if (!response.ok) {

          throw new Error(data?.error || "Failed to load doctor");

        }

        setDoctorInfo(data.doctor);

        setForm((prev) => ({

          ...prev,

          doctor: data.doctor?.displayName || prev.doctor

        }));

      } catch {

        setDoctorInfo(null);

      }

    };

    loadDoctor();

  }, []);



  useEffect(() => {

    setItems(loadAppointments(session));

  }, [session?.user?.docspaceId, session?.room?.id]);



  const sorted = useMemo(() => {

    return [...items].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  }, [items]);



  const activeItems = useMemo(

    () => sorted.filter((item) => item.status === "Scheduled"),

    [sorted]

  );

  const cancelledItems = useMemo(

    () => sorted.filter((item) => item.status !== "Scheduled"),

    [sorted]

  );



  const destroyEditor = () => {

    if (editorRef.current?.destroy) {

      editorRef.current.destroy();

    }

    editorRef.current = null;

  };



  const fillTicketHidden = async (file, appointment) => {

    if (!file?.id) return;

    if (!docspaceUrl) {

      setTicketMessage("VITE_DOCSPACE_URL is not set.");

      return;

    }

    const token = file?.shareToken || session?.user?.token || "";

    if (!token) {

      setTicketMessage("DocSpace token is missing.");

      return;

    }



    destroyEditor();



    try {

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

              setTicketMessage("Editor frame is not available.");

              destroyEditor();

              return;

            }

            const rawDate = appointment?.date || appointment?.dateTime || appointment?.datetime || "";

            const derivedDate = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;

            const derivedTime = rawDate.includes("T") ? rawDate.split("T")[1]?.slice(0, 5) || "" : "";

            const fallbackDoctor = appointment?.doctor || doctorInfo?.displayName || "";

            const templateData = {

              customerName: session?.user?.fullName || session?.user?.displayName || session?.user?.name || "Patient",

              projectName: "Appointment Ticket",

              startDate: appointment?.date || derivedDate || "",

              doctor: fallbackDoctor,

              time: appointment?.time || derivedTime || "",

              reason: appointment?.reason || ""

            };

            const ticketText = buildTicketText(templateData);

            const editorCallback = new Function(
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

                  Asc.scope.ticket = ${JSON.stringify(templateData)};

                  connector.callCommand(function () {
                    try {
                      var t = Asc.scope.ticket;

                      var doc = Api.GetDocument();

                      // Clear document if possible
                      if (doc.RemoveAllElements) doc.RemoveAllElements();

                      // Base typography
                      var textPr = doc.GetDefaultTextPr();
                      textPr.SetFontFamily("Calibri");
                      textPr.SetFontSize(22);
                      textPr.SetLanguage("en-US");

                      var normalStyle = doc.GetDefaultStyle("paragraph");
                      var normalParaPr = normalStyle.GetParaPr();
                      normalParaPr.SetSpacingLine(240, "auto");
                      normalParaPr.SetSpacingAfter(120);
                      normalParaPr.SetJc("left");

                      var normalTextPr = normalStyle.GetTextPr();
                      normalTextPr.SetColor(0x26, 0x26, 0x26, false);

                      // Title style
                      var titleStyle = doc.CreateStyle("TicketTitle", "paragraph");
                      var titleParaPr = titleStyle.GetParaPr();
                      titleParaPr.SetJc("center");
                      titleParaPr.SetSpacingAfter(180);

                      var titleTextPr = titleStyle.GetTextPr();
                      titleTextPr.SetFontFamily("Calibri Light");
                      titleTextPr.SetFontSize(52);
                      titleTextPr.SetColor(0x29, 0x33, 0x4F, false);

                      // Subtitle style
                      var subtitleStyle = doc.CreateStyle("TicketSubtitle", "paragraph");
                      var subParaPr = subtitleStyle.GetParaPr();
                      subParaPr.SetJc("center");
                      subParaPr.SetSpacingAfter(240);

                      var subTextPr = subtitleStyle.GetTextPr();
                      subTextPr.SetFontFamily("Calibri");
                      subTextPr.SetFontSize(20);
                      subTextPr.SetColor(0x55, 0x55, 0x55, false);

                      // Field style (card-like indent)
                      var fieldStyle = doc.CreateStyle("TicketField", "paragraph");
                      var fieldParaPr = fieldStyle.GetParaPr();
                      fieldParaPr.SetJc("left");
                      fieldParaPr.SetIndLeft(720);
                      fieldParaPr.SetIndRight(720);
                      fieldParaPr.SetSpacingAfter(120);

                      var fieldTextPr = fieldStyle.GetTextPr();
                      fieldTextPr.SetFontFamily("Calibri");
                      fieldTextPr.SetFontSize(22);
                      fieldTextPr.SetColor(0x26, 0x26, 0x26, false);

                      // Footer style
                      var footerStyle = doc.CreateStyle("TicketFooter", "paragraph");
                      var footerParaPr = footerStyle.GetParaPr();
                      footerParaPr.SetJc("right");
                      footerParaPr.SetIndLeft(720);
                      footerParaPr.SetIndRight(720);
                      footerParaPr.SetSpacingBefore(180);
                      footerParaPr.SetSpacingAfter(0);

                      var footerTextPr = footerStyle.GetTextPr();
                      footerTextPr.SetFontFamily("Calibri");
                      footerTextPr.SetFontSize(18);
                      footerTextPr.SetColor(0x55, 0x55, 0x55, false);

                      function safeText(v) {
                        return (v && String(v).trim()) ? String(v) : "-";
                      }

                      function pushPara(p) {
                        if (doc.Push) doc.Push(p);
                        else doc.InsertContent([p]);
                      }

                      function addDivider() {
                        var p = Api.CreateParagraph();
                        p.SetJc("center");
                        p.SetSpacingAfter(180);
                        var run = p.AddText("────────────────────────────────────────");
                        run.SetColor(0x99, 0x99, 0x99, false);
                        run.SetFontSize(18);
                        pushPara(p);
                      }

                      function addField(label, value) {
                        var p = Api.CreateParagraph();
                        p.SetStyle(fieldStyle);

                        var r1 = p.AddText(label + ": ");
                        r1.SetBold(true);
                        r1.SetColor(0x29, 0x33, 0x4F, false);

                        var r2 = p.AddText(safeText(value));
                        r2.SetBold(false);

                        pushPara(p);
                      }

                      // Title
                      var title = Api.CreateParagraph();
                      title.SetStyle(titleStyle);
                      title.AddText("APPOINTMENT TICKET");
                      pushPara(title);

                      // Subtitle (optional)
                      var sub = Api.CreateParagraph();
                      sub.SetStyle(subtitleStyle);
                      var subRun = sub.AddText("Please arrive 10 minutes early and bring your ID.");
                      subRun.SetItalic(true);
                      pushPara(sub);

                      addDivider();

                      addField("Patient", t.customerName);
                      addField("Document", t.projectName);
                      addField("Date", t.startDate);
                      addField("Time", t.time);
                      addField("Doctor", t.doctor);
                      addField("Reason", t.reason);

                      addDivider();

                      // Footer
                      var footer = Api.CreateParagraph();
                      footer.SetStyle(footerStyle);
                      var f = footer.AddText("Generated: " + new Date().toLocaleString());
                      f.SetItalic(true);
                      pushPara(footer);

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

            setTimeout(() => {

              destroyEditor();

            }, 8000);

          },

          onAppError: (error) => {

            console.error("DocSpace editor error", error);

            setTicketMessage(`Editor error: ${error?.message || error}`);

            setTimeout(() => destroyEditor(), 1500);

          }

        }

      });

      editorRef.current = instance;

    } catch (error) {

      setTicketMessage(error?.message || "Failed to open editor.");

    }

  };



  const handleShareTicket = async (ticket) => {
    if (!ticket?.id) return;
    setShareModal({ open: true, title: ticket.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId: ticket.id, token: session?.user?.token });
      setShareModal({ open: true, title: ticket.title, link: link?.shareLink || "", loading: false, error: "" });
    } catch (error) {
      setShareModal({ open: true, title: ticket.title, link: "", loading: false, error: typeof error?.message === "string" ? error.message : JSON.stringify(error?.message || error || "", null, 2) });
    }
  };



  const submit = async (event) => {

    event.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);

    if (!form.date || !form.time || !form.doctor) {

      setMessage("Please fill date, time, and doctor.");

      submitRef.current = false;
      setSubmitting(false);
      return;

    }

    const draft = {

      id: crypto.randomUUID(),

      ...form,

      status: "Scheduled",

      ticket: null

    };

    const next = [...items, draft];

    setItems(next);

    saveAppointments(session, next);

    setForm({ date: "", time: "", doctor: "", reason: "" });

    setMessage("Appointment scheduled.");

    setTicketMessage("");

    try {

      const roomId = await ensureRoomId();
      const response = await fetch("/api/patients/appointments/ticket", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          roomId,

          patientName: session?.user?.fullName || "Patient",

          appointment: draft

        })

      });

      const data = await response.json();

      if (!response.ok) {

        throw new Error(data?.error || "Failed to create ticket");

      }

      const file = data?.file || null;

      const updated = next.map((item) =>

        item.id === draft.id ? { ...item, ticket: file } : item

      );

      setItems(updated);

      saveAppointments(session, updated);

      const title = file?.title || "ticket";

      setTicketMessage(`Ticket created in room: ${title}`);

      await fillTicketHidden(file, draft);

    } catch (error) {

      setTicketMessage(error?.message || "Ticket not created");

    }
    finally {

      submitRef.current = false;

      setSubmitting(false);

    }

  };



  const cancel = (id) => {

    const next = items.map((item) =>

      item.id === id ? { ...item, status: "Cancelled" } : item

    );

    setItems(next);

    saveAppointments(session, next);

  };

  const openTicket = (ticket) => {
    if (!ticket?.url) return;
    setDocModal({
      open: true,
      title: ticket?.title || "Appointment ticket",
      url: ticket.url
    });
  };



    return (

      <PatientShell
        user={session.user}
        active="appointments"
        onNavigate={onNavigate}
        onLogout={onLogout}
        roomId={session?.room?.id}
        token={session?.user?.token}
      >

          <section className="panel">

            <div className="panel-head">

              <div>

                <h3>Book an appointment</h3>

                <p className="muted">Pick a time and the doctor will confirm the visit.</p>

              </div>

            </div>

          {doctorInfo && (

            <p className="muted">

              Assigned doctor: {doctorInfo.displayName}{doctorInfo.title ? ` - ${doctorInfo.title}` : ""}

            </p>

          )}

          <form className="auth-form" onSubmit={submit}>

            <label>

              Date

              <input

                type="date"
                lang="en-US"

                value={form.date}

                onChange={(e) => setForm({ ...form, date: e.target.value })}

                required

              />

            </label>

            <label>

              Time

              <input

                type="time"
                lang="en-US"

                value={form.time}

                onChange={(e) => setForm({ ...form, time: e.target.value })}

                required

              />

            </label>

            <label>

              Doctor

              <input

                type="text"

                placeholder="Dr. Morgan"

                value={form.doctor}

                onChange={(e) => setForm({ ...form, doctor: e.target.value })}

                required

              />

            </label>

            <label>

              Reason (optional)

              <textarea

                rows="3"

                value={form.reason}

                onChange={(e) => setForm({ ...form, reason: e.target.value })}

              />

            </label>

            <button className="primary" type="submit" disabled={submitting}>

              {submitting ? "Scheduling..." : "Schedule appointment"}

            </button>

          </form>

          {message && <p className="muted">{message}</p>}

          {ticketMessage && <p className="muted">{ticketMessage}</p>}

        </section>

          <section className="panel">

          <div className="panel-head">

            <div>

              <h3>Your appointments</h3>

              <p className="muted">Status and summary of scheduled visits.</p>

            </div>

          </div>

          <div className="appointment-list">

            {sorted.length === 0 && <p className="muted">No appointments yet.</p>}

            {activeItems.length > 0 && (

              <div className="appointment-group">

                <h4 className="appointment-group-title">Active appointments</h4>

                {activeItems.map((item) => (

                  <div key={item.id} className="appointment-card">

                    <div>

                      <h4>{item.date} - {item.time}</h4>

                      <p className="muted">Doctor: {item.doctor}</p>

                      {item.reason && <p className="muted">Reason: {item.reason}</p>}

                      {item.ticket?.title && (

                        <p className="muted">

                          Ticket:{" "}

                          {item.ticket?.url ? (

                            <button

                              className="link"

                              type="button"

                              onClick={() => openTicket(item.ticket)}

                            >

                              Open ticket

                            </button>

                          ) : (

                            item.ticket.title

                          )}

                          {item.ticket?.id && (

                            <button

                              className="secondary share-inline"

                              type="button"

                              onClick={() => handleShareTicket(item.ticket)}

                            >

                              Share QR

                            </button>

                          )}

                        </p>

                      )}

                    </div>

                    <div className="appointment-meta">

                      <span className={`status-pill ${item.status.toLowerCase()}`}>

                        {item.status}

                      </span>

                      <button className="ghost" type="button" onClick={() => cancel(item.id)}>

                        Cancel

                      </button>

                    </div>

                  </div>

                ))}

              </div>

            )}

            {cancelledItems.length > 0 && (

              <div className="appointment-group">

                <h4 className="appointment-group-title">Past & cancelled</h4>

                {cancelledItems.map((item) => (

                  <div key={item.id} className="appointment-card muted-card">

                    <div>

                      <h4>{item.date} - {item.time}</h4>

                      <p className="muted">Doctor: {item.doctor}</p>

                      {item.reason && <p className="muted">Reason: {item.reason}</p>}

                      {item.ticket?.title && (

                        <p className="muted">

                          Ticket:{" "}

                          {item.ticket?.url ? (

                            <button

                              className="link"

                              type="button"

                              onClick={() => openTicket(item.ticket)}

                            >

                              Open ticket

                            </button>

                          ) : (

                            item.ticket.title

                          )}

                          {item.ticket?.id && (

                            <button

                              className="secondary share-inline"

                              type="button"

                              onClick={() => handleShareTicket(item.ticket)}

                            >

                              Share QR

                            </button>

                          )}

                        </p>

                      )}

                    </div>

                    <div className="appointment-meta">

                      <span className={`status-pill ${item.status.toLowerCase()}`}>

                        {item.status}

                      </span>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </section>

        <ShareQrModal
          open={shareModal.open}
          title={shareModal.title}
          link={shareModal.link}
          loading={shareModal.loading}
          error={shareModal.error}
          onClose={() => setShareModal({ open: false, title: "", link: "", loading: false, error: "" })}
        />
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

function buildTicketText(data) {
  const datePart = data?.startDate ? `Date: ${data.startDate}` : "Date: -";
  const doctorPart = data?.doctor ? `Doctor: ${data.doctor}` : "Doctor: -";
  const timePart = data?.time ? `Time: ${data.time}` : "Time: -";
  const reasonPart = data?.reason ? `Reason: ${data.reason}` : "Reason: -";
  return [
    "APPOINTMENT TICKET",
    "",
    `Patient: ${data?.customerName || "Patient"}`,
    `Document: ${data?.projectName || "Appointment Ticket"}`,
    datePart,
    timePart,
    doctorPart,
    reasonPart,
    "",
    `Generated: ${new Date().toLocaleString()}`
  ].join("\n");
}

