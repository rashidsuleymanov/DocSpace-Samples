export default function DoctorScheduleSection({
  scheduledAppointments,
  openDoc,
  openRecordFromAppointment
}) {
  return (
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
  );
}

