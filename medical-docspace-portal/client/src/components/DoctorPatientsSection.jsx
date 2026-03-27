export default function DoctorPatientsSection({
  patientQuery,
  setPatientQuery,
  filteredRooms,
  openPatient
}) {
  return (
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
            <p className="muted doctor-patient-subtitle">Current demo patient</p>
            <div className="record-actions">
              <button className="primary" type="button" onClick={() => openPatient(room.id)}>
                Open chart
              </button>
            </div>
          </article>
        ))}
        {filteredRooms.length === 0 && <p className="muted">No patient rooms found.</p>}
      </div>
    </section>
  );
}

