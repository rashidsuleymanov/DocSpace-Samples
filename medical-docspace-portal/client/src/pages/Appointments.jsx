import { useEffect, useMemo, useRef, useState } from "react";

import Sidebar from "../components/Sidebar.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";

import Topbar from "../components/Topbar.jsx";
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



function loadAppointments() {

  try {

    const raw = localStorage.getItem(storageKey);

    return raw ? JSON.parse(raw) : [];

  } catch {

    return [];

  }

}



function saveAppointments(items) {

  localStorage.setItem(storageKey, JSON.stringify(items));

}



export default function Appointments({ session, onLogout, onNavigate }) {

  const [items, setItems] = useState(() => loadAppointments());

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

  const editorRef = useRef(null);



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

            console.log("[ticket] templateData", templateData);



            const ticketText = buildTicketText(templateData);

            const editorCallback = new Function(
              "editorInstance",
              `
                try {
                  if (typeof editorInstance?.createConnector !== "function") {
                    console.error("createConnector is not available", editorInstance);
                    return;
                  }
                  const connector = editorInstance.createConnector();
                  if (typeof connector?.callCommand !== "function") {
                    console.error("connector.callCommand is not available", connector);
                    return;
                  }
                  Asc.scope.textToInsert = ${JSON.stringify(ticketText)};
                  connector.callCommand(function () {
                    const doc = Api.GetDocument();
                    const p = Api.CreateParagraph();
                    p.AddText(Asc.scope.textToInsert);
                    doc.InsertContent([p]);
                    Api.Save();
                  });
                } catch (e) {
                  console.error("Error executing editor callback", e);
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

    if (!form.date || !form.time || !form.doctor) {

      setMessage("Please fill date, time, and doctor.");

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

    saveAppointments(next);

    setForm({ date: "", time: "", doctor: "", reason: "" });

    setMessage("Appointment scheduled.");

    setTicketMessage("");

    try {

      const response = await fetch("/api/patients/appointments/ticket", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          roomId: session.room?.id,

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

      saveAppointments(updated);

      const title = file?.title || "ticket";

      setTicketMessage(`Ticket created in room: ${title}`);

      await fillTicketHidden(file, draft);

    } catch (error) {

      setTicketMessage(error?.message || "Ticket not created");

    }

  };



  const cancel = (id) => {

    const next = items.map((item) =>

      item.id === id ? { ...item, status: "Cancelled" } : item

    );

    setItems(next);

    saveAppointments(next);

  };



  return (

    <div className="dashboard-layout">

      <Sidebar user={session.user} onLogout={onLogout} active="appointments" onNavigate={onNavigate} />

      <main>

        <Topbar room={session.room} />

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

                value={form.date}

                onChange={(e) => setForm({ ...form, date: e.target.value })}

                required

              />

            </label>

            <label>

              Time

              <input

                type="time"

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

            <button className="primary" type="submit">

              Schedule appointment

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

                              onClick={() =>

                                window.open(item.ticket.url, "_blank", "noopener,noreferrer")

                              }

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

                              onClick={() =>

                                window.open(item.ticket.url, "_blank", "noopener,noreferrer")

                              }

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
        <div id={editorFrameId} className="hidden-editor" />

      </main>

    </div>

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

