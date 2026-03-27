export default function DoctorFillSignSection({
  setFillModalOpen,
  fillPatientQuery,
  setFillPatientQuery,
  filteredFillRooms,
  selectedRoomId,
  setSelectedRoomId,
  fillTab,
  setFillTab,
  fillCounts,
  loadFillItems,
  fillLoading,
  fillError,
  fillItems,
  openDoc,
  canCancelFillSignItem,
  onCancelFillSign
}) {
  return (
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
                              onClick={() => onCancelFillSign(file)}
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
  );
}

