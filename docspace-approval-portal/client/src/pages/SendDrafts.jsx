import { useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Tabs from "../components/Tabs.jsx";
import { deleteLocalDraft, listLocalDrafts } from "../services/draftsStore.js";

function normalize(value) {
  return String(value || "").trim();
}

function typeLabel(type) {
  const t = String(type || "").trim();
  if (t === "bulkLinks") return "Bulk links";
  if (t === "bulkSend") return "Bulk send";
  return "Request";
}

function typeTone(type) {
  const t = String(type || "").trim();
  if (t === "bulkLinks") return "gray";
  if (t === "bulkSend") return "blue";
  return "yellow";
}

export default function SendDrafts({ session, busy, onOpenRequests, onOpenBulkSend, onOpenBulkLinks }) {
  const [tab, setTab] = useState("all"); // all | request | bulkSend | bulkLinks
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);

  const drafts = useMemo(() => {
    const list = listLocalDrafts(session);
    const filteredByTab =
      tab === "request" ? list.filter((d) => d.type === "request") : tab === "bulkSend" ? list.filter((d) => d.type === "bulkSend") : tab === "bulkLinks" ? list.filter((d) => d.type === "bulkLinks") : list;

    const q = normalize(query).toLowerCase();
    const filtered = q
      ? filteredByTab.filter((d) => {
          const hay = `${normalize(d.title)} ${normalize(d.payload?.templateTitle)} ${normalize(d.payload?.kind)}`.toLowerCase();
          return hay.includes(q);
        })
      : filteredByTab;

    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, session, tab, tick]);

  const tabItems = useMemo(
    () => [
      { id: "all", label: "All" },
      { id: "request", label: "Requests" },
      { id: "bulkSend", label: "Bulk send" },
      { id: "bulkLinks", label: "Bulk links" }
    ],
    []
  );

  const openDraft = (draft) => {
    const type = String(draft?.type || "request");
    const payload = draft?.payload && typeof draft.payload === "object" ? draft.payload : {};
    if (type === "bulkSend") {
      onOpenBulkSend?.();
      setTimeout(() => window.dispatchEvent(new CustomEvent("portal:bulkSendLoadDraft", { detail: { payload } })), 0);
      return;
    }
    if (type === "bulkLinks") {
      onOpenBulkLinks?.();
      setTimeout(() => window.dispatchEvent(new CustomEvent("portal:bulkLinksLoadDraft", { detail: { payload } })), 0);
      return;
    }
    onOpenRequests?.();
    setTimeout(() => window.dispatchEvent(new CustomEvent("portal:requestsLoadDraft", { detail: { payload } })), 0);
  };

  const removeDraft = (draft) => {
    const ok = typeof window !== "undefined" ? window.confirm(`Delete draft "${normalize(draft?.title) || "Draft"}"?`) : true;
    if (!ok) return;
    deleteLocalDraft(session, draft?.id);
    setTick((n) => n + 1);
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Drafts</h2>
          <p className="muted">Save unfinished sends and continue later.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setTick((n) => n + 1)} disabled={busy}>
            Refresh
          </button>
          <button type="button" className="primary" onClick={() => onOpenRequests?.()} disabled={busy}>
            New request
          </button>
        </div>
      </header>

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>Saved drafts</h3>
            <p className="muted">Stored locally in your browser.</p>
          </div>
          <div className="card-header-actions">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." disabled={busy} style={{ maxWidth: 260 }} />
            <span className="muted">{drafts.length} shown</span>
          </div>
        </div>

        <div className="request-filters">
          <Tabs value={tab} onChange={setTab} items={tabItems} ariaLabel="Draft type" />
        </div>

        {!drafts.length ? (
          <EmptyState title="No drafts yet" description="Start a request or a bulk action, then click Save draft." />
        ) : (
          <div className="list">
            {drafts.map((d) => {
              const type = String(d.type || "request");
              const templateTitle = normalize(d.payload?.templateTitle);
              const kind = normalize(d.payload?.kind);
              const updated = normalize(d.updatedAt || d.createdAt).slice(0, 19).replace("T", " ");
              const recipientsCount = Array.isArray(d.payload?.recipients) ? d.payload.recipients.length : Array.isArray(d.payload?.emails) ? d.payload.emails.length : 0;
              return (
                <div key={d.id} className="list-row request-row">
                  <div className="list-main">
                    <strong className="truncate">{d.title}</strong>
                    <span className="muted request-row-meta">
                      <StatusPill tone={typeTone(type)}>{typeLabel(type)}</StatusPill>{" "}
                      {templateTitle ? <StatusPill tone="gray">{templateTitle}</StatusPill> : null}{" "}
                      {kind ? <StatusPill tone="gray">{kind}</StatusPill> : null}{" "}
                      {recipientsCount ? <StatusPill tone="gray">{`${recipientsCount} recipient(s)`}</StatusPill> : null}{" "}
                      <span className="muted">Saved {updated || "-"}</span>
                    </span>
                  </div>
                  <div className="list-actions">
                    <button type="button" className="primary" onClick={() => openDraft(d)} disabled={busy}>
                      Continue
                    </button>
                    <button type="button" className="danger" onClick={() => removeDraft(d)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

