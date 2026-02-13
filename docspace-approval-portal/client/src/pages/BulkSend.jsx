import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Tabs from "../components/Tabs.jsx";
import { createFlowFromTemplate } from "../services/portalApi.js";
import { deleteBulkBatch, listBulkBatches, restoreBulkBatch, saveBulkBatch, trashBulkBatch } from "../services/bulkHistoryStore.js";
import { saveLocalDraft } from "../services/draftsStore.js";

function normalize(value) {
  return String(value || "").trim();
}

function parseEmails(value) {
  const parts = String(value || "")
    .split(/[\n,;]+/g)
    .map((s) => normalize(s).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function isPdfFile(item) {
  const ext = String(item?.fileExst || "").trim().toLowerCase();
  const title = String(item?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

function csvEscape(value) {
  const v = String(value ?? "");
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv(filename, rows) {
  const content = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function BulkSend({ session, busy, activeRoomId, activeProject, templates = [], onOpenRequests }) {
  const token = normalize(session?.token);
  const hasProject = Boolean(normalize(activeRoomId)) && Boolean(activeProject?.id);
  const projectTitle = String(activeProject?.title || "").trim() || "Current project";

  const [kind, setKind] = useState("fillSign"); // fillSign | approval
  const [step, setStep] = useState("template"); // template | recipients | done
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [resultFlows, setResultFlows] = useState([]);
  const [draftId, setDraftId] = useState("");
  const [view, setView] = useState("create"); // create | history | trash
  const [historyTick, setHistoryTick] = useState(0);

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("Document");
  const [docUrl, setDocUrl] = useState("");

  useEffect(() => {
    const handler = (evt) => {
      const emails = Array.isArray(evt?.detail?.emails) ? evt.detail.emails : [];
      if (!emails.length) return;
      setRecipientsRaw((prev) => {
        const current = parseEmails(prev);
        const next = Array.from(new Set([...current, ...emails.map((e) => normalize(e).toLowerCase()).filter(Boolean)]));
        return next.join("\n");
      });
      setStep("recipients");
    };
    window.addEventListener("portal:bulkRecipients", handler);
    return () => window.removeEventListener("portal:bulkRecipients", handler);
  }, []);

  useEffect(() => {
    const handler = (evt) => {
      const payload = evt?.detail?.payload || null;
      if (!payload || typeof payload !== "object") return;
      setKind(String(payload.kind || "fillSign"));
      setSelectedId(String(payload.templateId || ""));
      setRecipientsRaw(String(payload.recipientsRaw || ""));
      setDueDate(String(payload.dueDate || ""));
      setDraftId(String(payload.draftId || ""));
      setStep(String(payload.step || "recipients"));
      setError("");
    };
    window.addEventListener("portal:bulkSendLoadDraft", handler);
    return () => window.removeEventListener("portal:bulkSendLoadDraft", handler);
  }, []);

  const templateItems = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    const onlyPdf = list.filter((t) => isPdfFile(t));
    const q = normalize(query).toLowerCase();
    const items = q ? onlyPdf.filter((t) => String(t?.title || "").toLowerCase().includes(q)) : onlyPdf;
    items.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || "")));
    return items;
  }, [query, templates]);

  const historyItems = useMemo(() => {
    return listBulkBatches(session, "bulkSend", { includeTrashed: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTick, session]);

  const activeHistory = useMemo(() => historyItems.filter((b) => !b.trashedAt), [historyItems]);
  const trashedHistory = useMemo(() => historyItems.filter((b) => Boolean(b.trashedAt)), [historyItems]);

  const selectedTemplate = useMemo(() => {
    const id = normalize(selectedId);
    if (!id) return null;
    return templateItems.find((t) => String(t?.id) === id) || null;
  }, [selectedId, templateItems]);

  const recipients = useMemo(() => parseEmails(recipientsRaw), [recipientsRaw]);

  const kindItems = useMemo(
    () => [
      { id: "fillSign", label: "Fill & Sign" },
      { id: "approval", label: "Approval" }
    ],
    []
  );

  const openDoc = (flow) => {
    const url = normalize(flow?.openUrl);
    if (!url) return;
    setDocTitle(String(flow?.fileTitle || flow?.templateTitle || "Document"));
    setDocUrl(url);
    setDocOpen(true);
  };

  const copy = async (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const createBulk = async () => {
    if (!token) return;
    setError("");
    if (!hasProject) {
      setError("Select a project in the sidebar first.");
      return;
    }
    if (!selectedTemplate?.id) {
      setError("Select a template first.");
      return;
    }
    if (kind === "fillSign" && !recipients.length) {
      setError("Add at least one recipient email.");
      return;
    }
    if (recipients.length > 100) {
      setError("Too many recipients. Limit is 100.");
      return;
    }

    setActionBusy(true);
    try {
      const res = await createFlowFromTemplate({
        token,
        templateFileId: String(selectedTemplate.id),
        projectId: String(activeProject?.id || ""),
        recipientEmails: recipients,
        dueDate: normalize(dueDate) || null,
        kind
      });
      const flows = Array.isArray(res?.flows) ? res.flows : res?.flow ? [res.flow] : [];
      setResultFlows(flows);
      setStep("done");
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      if (flows.length) {
        const title = `${String(selectedTemplate?.title || "Bulk send").trim()} - ${recipients.length} recipient(s)`;
        saveBulkBatch(session, "bulkSend", {
          type: "bulkSend",
          title,
          payload: {
            projectId: String(activeProject?.id || ""),
            projectTitle: String(activeProject?.title || ""),
            kind,
            templateId: String(selectedTemplate?.id || ""),
            templateTitle: String(selectedTemplate?.title || ""),
            recipients: recipients.slice(),
            dueDate: normalize(dueDate) || "",
            links: flows.map((f) => normalize(f?.openUrl)).filter(Boolean),
            flowIds: flows.map((f) => String(f?.id || "").trim()).filter(Boolean)
          }
        });
        setHistoryTick((n) => n + 1);
      }
    } catch (e) {
      setError(e?.message || "Bulk send failed");
    } finally {
      setActionBusy(false);
    }
  };

  const saveDraft = () => {
    const template = selectedTemplate || templateItems.find((t) => String(t?.id) === String(selectedId)) || null;
    const title = `${String(template?.title || "Bulk send").trim()} (bulk)`.trim();
    const saved = saveLocalDraft(session, {
      id: draftId || "",
      type: "bulkSend",
      title,
      payload: {
        kind,
        templateId: String(selectedId || ""),
        templateTitle: String(template?.title || ""),
        recipientsRaw,
        dueDate,
        step
      }
    });
    setDraftId(saved?.id || "");
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Bulk send</h2>
          <p className="muted">Send the same template to multiple recipients.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setView("create")} disabled={busy || actionBusy}>
            Create
          </button>
          <button type="button" onClick={() => setView("history")} disabled={busy || actionBusy}>
            History
          </button>
          <button type="button" onClick={() => setView("trash")} disabled={busy || actionBusy}>
            Trash
          </button>
          <button type="button" onClick={() => onOpenRequests?.()} disabled={busy || actionBusy}>
            Open Requests
          </button>
          <button type="button" onClick={saveDraft} disabled={busy || actionBusy || !selectedId}>
            Save draft
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setStep("template");
              setSelectedId("");
              setRecipientsRaw("");
              setResultFlows([]);
              setError("");
              setDraftId("");
            }}
            disabled={busy || actionBusy}
          >
            New batch
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {!hasProject ? (
        <section className="card">
          <EmptyState title="Select a project first" description="Pick a project in the left sidebar. Bulk send works inside the current project (including Personal workspace)." />
        </section>
      ) : (
        <section className="card">
          <div className="card-header compact">
            <div>
              <h3>{projectTitle}</h3>
              <p className="muted">Template → recipients → create</p>
            </div>
            <div className="card-header-actions">
              <Tabs value={kind} onChange={(next) => setKind(String(next || "fillSign"))} items={kindItems} ariaLabel="Request type" />
            </div>
          </div>

          {view !== "create" ? (
            <div className="list">
              {(view === "history" ? activeHistory : trashedHistory).length === 0 ? (
                <EmptyState
                  title={view === "trash" ? "Trash is empty" : "No batches yet"}
                  description={view === "trash" ? "Move batches to trash to hide them." : "Create a bulk send to see it here."}
                />
              ) : (
                (view === "history" ? activeHistory : trashedHistory).map((b) => {
                  const payload = b.payload || {};
                  const links = Array.isArray(payload.links) ? payload.links : [];
                  const recipientsCount = Array.isArray(payload.recipients) ? payload.recipients.length : 0;
                  const updated = String(b.updatedAt || b.createdAt || "").slice(0, 19).replace("T", " ");
                  return (
                    <div key={b.id} className="list-row request-row">
                      <div className="list-main">
                        <strong className="truncate">{b.title}</strong>
                        <span className="muted request-row-meta">
                          <StatusPill tone="blue">Bulk send</StatusPill>{" "}
                          {payload.projectTitle ? <StatusPill tone="gray">{String(payload.projectTitle)}</StatusPill> : null}{" "}
                          {payload.kind ? <StatusPill tone="gray">{String(payload.kind)}</StatusPill> : null}{" "}
                          {recipientsCount ? <StatusPill tone="gray">{`${recipientsCount} recipient(s)`}</StatusPill> : null}{" "}
                          <span className="muted">Saved {updated || "-"}</span>
                        </span>
                      </div>
                      <div className="list-actions">
                        <button
                          type="button"
                          onClick={() => copy(links.join("\n"))}
                          disabled={busy || actionBusy || links.length === 0}
                        >
                          Copy links
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const rows = [
                              ["title", "recipients", "status", "link"],
                              ...links.map((l) => [String(payload.templateTitle || "Request"), "", "InProgress", String(l || "")])
                            ];
                            downloadCsv("bulk-send.csv", rows);
                          }}
                          disabled={busy || actionBusy || links.length === 0}
                        >
                          Export CSV
                        </button>
                        {view === "trash" ? (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              restoreBulkBatch(session, "bulkSend", b.id);
                              setHistoryTick((n) => n + 1);
                            }}
                            disabled={busy || actionBusy}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              trashBulkBatch(session, "bulkSend", b.id);
                              setHistoryTick((n) => n + 1);
                            }}
                            disabled={busy || actionBusy}
                          >
                            Trash
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            const ok = typeof window !== "undefined" ? window.confirm("Delete this batch permanently?") : true;
                            if (!ok) return;
                            deleteBulkBatch(session, "bulkSend", b.id);
                            setHistoryTick((n) => n + 1);
                          }}
                          disabled={busy || actionBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : step !== "done" ? (
            <div className="wizard">
              <div className="wizard-section">
                <div className="wizard-head">
                  <strong>1) Choose template</strong>
                  <span className="muted">{selectedTemplate?.title ? "Selected" : "Pick a PDF template"}</span>
                </div>
                <div className="auth-form" style={{ marginTop: 0 }}>
                  <label>
                    <span>Search</span>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates..." disabled={busy || actionBusy} />
                  </label>
                </div>
                {!templateItems.length ? (
                  <EmptyState title="No templates found" description="Publish a PDF form template to this project first." />
                ) : (
                  <div className="select-list">
                    {templateItems.slice(0, 12).map((t) => {
                      const selected = String(selectedId) === String(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`select-row${selected ? " is-selected" : ""}`}
                          onClick={() => {
                            setSelectedId(String(t.id));
                            setStep("recipients");
                          }}
                          disabled={busy || actionBusy}
                        >
                          <div className="select-row-main">
                            <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                          </div>
                          <span className="select-row-right" aria-hidden="true">
                            {selected ? "Selected" : ">"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="wizard-divider" />

              <div className="wizard-section">
                <div className="wizard-head">
                  <strong>2) Add recipients</strong>
                  <span className="muted">{kind === "fillSign" ? "Required" : "Optional"}</span>
                </div>

                <div className="auth-form" style={{ marginTop: 0 }}>
                  <label>
                    <span>Emails</span>
                    <textarea
                      value={recipientsRaw}
                      onChange={(e) => setRecipientsRaw(e.target.value)}
                      placeholder="name@company.com\nanother@company.com"
                      disabled={busy || actionBusy}
                      rows={6}
                    />
                  </label>
                  <div className="row-actions" style={{ justifyContent: "space-between" }}>
                    <span className="muted">{recipients.length} recipient(s)</span>
                    <button
                      type="button"
                      className="primary"
                      onClick={createBulk}
                      disabled={busy || actionBusy || !selectedTemplate?.id || (kind === "fillSign" && recipients.length === 0)}
                    >
                      {actionBusy ? "Working..." : "Create requests"}
                    </button>
                  </div>

                  <div className="row-actions" style={{ justifyContent: "space-between" }}>
                    <label className="checkbox">
                      <input type="checkbox" checked={Boolean(dueDate)} onChange={(e) => setDueDate(e.target.checked ? new Date().toISOString().slice(0, 10) : "")} disabled={busy || actionBusy} />
                      <span>Set due date</span>
                    </label>
                    {dueDate ? (
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy || actionBusy} />
                    ) : null}
                  </div>

                  <p className="muted" style={{ margin: 0 }}>
                    Tip: select contacts in Contacts, then click Bulk send.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="list">
              {!resultFlows.length ? (
                <EmptyState title="No results" description="Create requests to see links here." />
              ) : (
                <>
                  <div className="card-header compact" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <h3 style={{ margin: 0 }}>Created</h3>
                      <p className="muted" style={{ margin: "6px 0 0" }}>
                        {resultFlows.length} request(s)
                      </p>
                    </div>
                    <div className="card-header-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const links = resultFlows.map((f) => normalize(f?.openUrl)).filter(Boolean);
                          copy(links.join("\n"));
                        }}
                        disabled={busy || actionBusy}
                      >
                        Copy links
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const rows = [
                            ["title", "recipients", "status", "link"],
                            ...resultFlows.map((f) => [
                              String(f?.fileTitle || f?.templateTitle || "Request"),
                              Array.isArray(f?.recipientEmails) ? f.recipientEmails.join("; ") : "",
                              String(f?.status || "InProgress"),
                              String(f?.openUrl || "")
                            ])
                          ];
                          downloadCsv("bulk-send.csv", rows);
                        }}
                        disabled={busy || actionBusy}
                      >
                        Export CSV
                      </button>
                      <button type="button" className="primary" onClick={() => onOpenRequests?.()} disabled={busy || actionBusy}>
                        View in Requests
                      </button>
                    </div>
                  </div>
                  {resultFlows.map((flow) => {
                    const openUrl = normalize(flow?.openUrl);
                    const email = Array.isArray(flow?.recipientEmails) && flow.recipientEmails.length ? flow.recipientEmails.join(", ") : recipients.join(", ");
                    return (
                      <div key={String(flow?.id || openUrl)} className="list-row request-row">
                        <div className="list-main">
                          <strong className="truncate">{flow?.fileTitle || flow?.templateTitle || "Request"}</strong>
                          <span className="muted request-row-meta">
                            <StatusPill tone="yellow">In progress</StatusPill>{" "}
                            {email ? <StatusPill tone="gray">{email}</StatusPill> : null}{" "}
                            {openUrl ? <span className="muted truncate">Link ready</span> : <span className="muted">No link</span>}
                          </span>
                        </div>
                        <div className="list-actions">
                          <button type="button" className="primary" onClick={() => openDoc(flow)} disabled={busy || actionBusy || !openUrl}>
                            Open
                          </button>
                          <button type="button" onClick={() => copy(openUrl)} disabled={busy || actionBusy || !openUrl}>
                            Copy link
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </section>
      )}

      <DocSpaceModal open={docOpen} title={docTitle} url={docUrl} onClose={() => setDocOpen(false)} />
    </div>
  );
}
