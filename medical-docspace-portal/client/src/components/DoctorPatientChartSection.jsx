import FolderTile from "./FolderTile.jsx";

export default function DoctorPatientChartSection({
  setView,
  doctorFolders,
  handleDoctorFolderClick,
  activeFolderTitle,
  folderStack,
  goFolderBack,
  isLabFolderActive,
  isPrescriptionFolderActive,
  isSickLeaveFolderActive,
  isGenericDocFolderActive,
  isImagingFolderActive,
  setLabModalOpen,
  setRxModalOpen,
  setSickLeaveOpen,
  selectedRoom,
  setDocCreateForm,
  setDocCreateModalOpen,
  setImagingPackageOpen,
  setImagingUploadOpen,
  activeFolderLoading,
  activeFolderItems,
  openFolderById,
  openActiveFolderItem,
  labLoading,
  labResults,
  openDoc
}) {
  return (
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
          {!activeFolderLoading && activeFolderItems.length === 0 && <p className="muted">No files yet.</p>}
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
          {!labLoading && labResults.length === 0 && <p className="muted">No lab files yet.</p>}
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
  );
}

