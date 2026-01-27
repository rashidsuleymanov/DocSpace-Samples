import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar.jsx";
import ShareQrModal from "../components/ShareQrModal.jsx";
import Topbar from "../components/Topbar.jsx";
import { createFileShareLink } from "../services/docspaceApi.js";

export default function MedicalRecords({ session, onLogout, onNavigate }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareModal, setShareModal] = useState({ open: false, title: "", link: "", loading: false, error: "" });

  useEffect(() => {
    const load = async () => {
      if (!session?.room?.id || session.room.id === "DOCSPACE") {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");
        const headers = session?.user?.token ? { Authorization: session.user.token } : undefined;
        const response = await fetch(`/api/patients/medical-records?roomId=${session.room.id}`, {
          headers
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load medical records");
        }
        setRecords(data.records || []);
      } catch (err) {
        setRecords([]);
        setError(err.message || "Failed to load medical records");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [session]);

  const activeRecords = useMemo(
    () => records.filter((record) => record.status === "Active"),
    [records]
  );
  const historyRecords = useMemo(
    () => records.filter((record) => record.status !== "Active"),
    [records]
  );

  const handleShareDocument = async (record) => {
    const fileId = record?.document?.id;
    if (!fileId) return;
    setShareModal({ open: true, title: record.title, link: "", loading: true, error: "" });
    try {
      const link = await createFileShareLink({ fileId, token: session?.user?.token });
      setShareModal({ open: true, title: record.title, link: link?.shareLink || "", loading: false, error: "" });
    } catch (err) {
      setShareModal({ open: true, title: record.title, link: "", loading: false, error: typeof err?.message === "string" ? err.message : JSON.stringify(err?.message || err || "", null, 2) });
    }
  };



  return (
    <div className="dashboard-layout">
      <Sidebar user={session.user} onLogout={onLogout} active="records" onNavigate={onNavigate} />
      <main>
        <Topbar room={session.room} />

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Medical records</h3>
              <p className="muted">
                Records are created by your doctor. You can review them and open the linked document.
              </p>
            </div>
          </div>

          {loading && <p className="muted">Loading medical records...</p>}
          {error && !loading && <p className="muted">Error: {error}</p>}

          {!loading && !error && (
            <div className="records-list">
              {activeRecords.length === 0 && <p className="muted">No active records yet.</p>}
              {activeRecords.map((record) => (
                <article key={record.id} className="record-card">
                  <div className="record-meta">
                    <span className="record-type">{record.type}</span>
                    <span className="record-date">{record.date}</span>
                  </div>
                  <h4 className="record-title">{record.title}</h4>
                  <p className="muted">Doctor: {record.doctor || "-"}</p>
                  {record.description && <p className="record-summary">{record.description}</p>}
                  {record.document?.url && (
                    <p className="muted">
                      Document:{" "}
                      <button
                        className="link"
                        type="button"
                        onClick={() => window.open(record.document.url, "_blank", "noopener,noreferrer")}
                      >
                        Open document
                      </button>
                      {record.document?.id && (
                        <button
                          className="secondary share-inline"
                          type="button"
                          onClick={() => handleShareDocument(record)}
                        >
                          Share QR
                        </button>
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {!loading && !error && historyRecords.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>History</h3>
                <p className="muted">Older records kept for reference.</p>
              </div>
            </div>
            <div className="records-list history">
              {historyRecords.map((record) => (
                <article key={record.id} className="record-card muted-card">
                  <div className="record-meta">
                    <span className="record-type">{record.type}</span>
                    <span className="record-date">{record.date}</span>
                  </div>
                  <h4 className="record-title">{record.title}</h4>
                  {record.description && <p className="record-summary">{record.description}</p>}
                  {record.document?.url && (
                    <p className="muted">
                      Document:{" "}
                      <button
                        className="link"
                        type="button"
                        onClick={() => window.open(record.document.url, "_blank", "noopener,noreferrer")}
                      >
                        Open document
                      </button>
                      {record.document?.id && (
                        <button
                          className="secondary share-inline"
                          type="button"
                          onClick={() => handleShareDocument(record)}
                        >
                          Share QR
                        </button>
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        <ShareQrModal
          open={shareModal.open}
          title={shareModal.title}
          link={shareModal.link}
          loading={shareModal.loading}
          error={shareModal.error}
          onClose={() => setShareModal({ open: false, title: "", link: "", loading: false, error: "" })}
        />
      </main>
    </div>
  );
}
