import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import RequestDetailsModal from "../components/RequestDetailsModal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Tabs from "../components/Tabs.jsx";
import { activateProject, createProject, listFlows } from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function isPersonalTitle(title) {
  const t = normalize(title).toLowerCase();
  return t === "personal" || t.startsWith("personal -") || t.startsWith("personal:");
}

function flowTitle(flow) {
  return (
    String(flow?.resultFileTitle || "").trim() ||
    String(flow?.fileTitle || "").trim() ||
    String(flow?.templateTitle || "").trim() ||
    "Document"
  );
}

function statusTone(status) {
  const s = String(status || "");
  if (s === "Completed") return "green";
  if (s === "Canceled") return "red";
  if (s === "InProgress") return "yellow";
  return "gray";
}

export default function Documents({ session, busy, projects = [], onOpenRequests, onOpenProjects }) {
  const token = normalize(session?.token);
  const meId = normalize(session?.user?.id);
  const meEmail = normalize(session?.user?.email).toLowerCase();
  const displayName = session?.user?.displayName || session?.user?.email || "User";

  const [tab, setTab] = useState("my"); // my | personal
  const [who, setWho] = useState("all"); // all | assigned | created
  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flows, setFlows] = useState([]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsGroup, setDetailsGroup] = useState(null);
  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("Document");
  const [docUrl, setDocUrl] = useState("");

  const [createPersonalOpen, setCreatePersonalOpen] = useState(false);
  const [createPersonalTitle, setCreatePersonalTitle] = useState(() => `Personal - ${String(displayName || "User").trim()}`.trim());

  const roomTitleById = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const map = new Map();
    for (const p of list) {
      const rid = normalize(p?.roomId);
      if (!rid) continue;
      map.set(rid, String(p?.title || "").trim() || "Project");
    }
    return map;
  }, [projects]);

  const personalRoomIds = useMemo(() => {
    const ids = new Set();
    for (const p of Array.isArray(projects) ? projects : []) {
      const rid = normalize(p?.roomId);
      if (!rid) continue;
      if (isPersonalTitle(p?.title)) ids.add(rid);
    }
    return ids;
  }, [projects]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    listFlows({ token, includeArchived: true })
      .then((data) => setFlows(Array.isArray(data?.flows) ? data.flows : []))
      .catch((e) => {
        setFlows([]);
        setError(e?.message || "Failed to load documents");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const docs = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    const completed = items.filter((f) => String(f?.status || "") === "Completed" && normalize(f?.resultFileUrl || f?.openUrl));

    const byKey = new Map();
    for (const flow of completed) {
      const key = normalize(flow?.resultFileId) || normalize(flow?.fileId) || normalize(flow?.id);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, flow);
        continue;
      }
      const a = String(existing?.completedAt || existing?.updatedAt || existing?.createdAt || "");
      const b = String(flow?.completedAt || flow?.updatedAt || flow?.createdAt || "");
      if (String(b).localeCompare(String(a)) > 0) byKey.set(key, flow);
    }

    const list = Array.from(byKey.values());
    list.sort((a, b) => String(b?.completedAt || b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.completedAt || a?.updatedAt || a?.createdAt || "")));
    return list;
  }, [flows]);

  const filtered = useMemo(() => {
    const q = normalize(query).toLowerCase();
    const base =
      tab === "personal"
        ? docs.filter((f) => {
            const rid = normalize(f?.projectRoomId);
            if (!rid) return false;
            if (personalRoomIds.has(rid)) return true;
            const title = roomTitleById.get(rid) || "";
            return isPersonalTitle(title);
          })
        : docs;

    const scoped =
      who === "created"
        ? base.filter((f) => normalize(f?.createdByUserId) === meId)
        : who === "assigned"
          ? base.filter((f) => {
              const recipients = Array.isArray(f?.recipientEmails) ? f.recipientEmails : [];
              return meEmail && recipients.map((e) => normalize(e).toLowerCase()).includes(meEmail);
            })
          : base;

    if (!q) return scoped;
    return scoped.filter((f) => {
      const rid = normalize(f?.projectRoomId);
      const project = rid ? roomTitleById.get(rid) || "" : "";
      const hay = `${flowTitle(f)} ${project}`.toLowerCase();
      return hay.includes(q);
    });
  }, [docs, meEmail, meId, personalRoomIds, query, roomTitleById, tab, who]);

  const groupsById = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    const map = new Map();
    for (const f of items) {
      if (!f?.id) continue;
      const gid = normalize(f?.groupId || f.id) || normalize(f.id);
      const entry = map.get(gid) || { id: gid, flows: [] };
      entry.flows.push(f);
      map.set(gid, entry);
    }
    for (const entry of map.values()) {
      entry.flows.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
      entry.primaryFlow = entry.flows[0] || null;
      const total = entry.flows.length;
      const completed = entry.flows.filter((x) => String(x?.status || "") === "Completed").length;
      const canceled = entry.flows.filter((x) => String(x?.status || "") === "Canceled").length;
      entry.counts = { total, completed, canceled };
      entry.status = total > 0 && completed === total ? "Completed" : total > 0 && canceled === total ? "Canceled" : "InProgress";
      entry.projectRoomId = entry.primaryFlow?.projectRoomId || null;
      entry.createdAt = entry.primaryFlow?.createdAt || null;
    }
    return map;
  }, [flows]);

  const hasPersonalWorkspace = useMemo(() => {
    return Array.isArray(projects) && projects.some((p) => isPersonalTitle(p?.title));
  }, [projects]);

  const personalProject = useMemo(() => {
    return (Array.isArray(projects) ? projects : []).find((p) => isPersonalTitle(p?.title)) || null;
  }, [projects]);

  const activatePersonalWorkspace = async () => {
    if (!personalProject?.id) return false;
    setLoading(true);
    setError("");
    try {
      await activateProject(personalProject.id);
      window.dispatchEvent(new CustomEvent("portal:projectChanged"));
      return true;
    } catch (e) {
      setError(e?.message || "Failed to activate personal workspace");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const openDoc = (flow) => {
    const url = normalize(flow?.resultFileUrl || flow?.openUrl);
    if (!url) return;
    setDocTitle(flowTitle(flow));
    setDocUrl(url);
    setDocOpen(true);
  };

  const openDetailsFromFlow = (flow) => {
    const gid = normalize(flow?.groupId || flow?.id);
    const group = gid ? groupsById.get(gid) : null;
    if (!group) return;
    setDetailsGroup(group);
    setDetailsOpen(true);
  };

  const tabItems = useMemo(
    () => [
      { id: "my", label: "My documents" },
      { id: "personal", label: "Personal" }
    ],
    []
  );

  const whoItems = useMemo(
    () => [
      { id: "all", label: "All" },
      { id: "assigned", label: "Assigned to me" },
      { id: "created", label: "Created by me" }
    ],
    []
  );

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Documents</h2>
          <p className="muted">Your completed files across projects.</p>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (tab === "personal" && !hasPersonalWorkspace) {
                setCreatePersonalOpen(true);
                return;
              }

              const run = async () => {
                if (tab === "personal") {
                  const ok = await activatePersonalWorkspace();
                  if (!ok) return;
                }
                onOpenRequests?.();
                setTimeout(() => window.dispatchEvent(new CustomEvent("portal:requestsNew")), 0);
              };
              run().catch(() => null);
            }}
            disabled={busy || loading}
          >
            New request
          </button>
          <button type="button" onClick={() => (tab === "personal" ? setCreatePersonalOpen(true) : onOpenProjects?.())} disabled={busy || loading}>
            {tab === "personal" ? "Create personal workspace" : "Projects"}
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>{tab === "personal" ? "Personal documents" : "My documents"}</h3>
            <p className="muted">
              {tab === "personal"
                ? "A private workspace for personal signing tasks."
                : "Documents where you participated (created or were assigned)."}
            </p>
          </div>
          <div className="card-header-actions">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              disabled={busy || loading}
              style={{ maxWidth: 260 }}
            />
            {loading ? <span className="muted" style={{ fontSize: 12 }}>Loading...</span> : null}
            <span className="muted">{filtered.length} shown</span>
          </div>
        </div>

        <div className="request-filters">
          <Tabs value={tab} onChange={setTab} items={tabItems} ariaLabel="Documents scope" />
          <Tabs value={who} onChange={setWho} items={whoItems} ariaLabel="Documents filter" />
        </div>

        <div className="list">
          {tab === "personal" && !hasPersonalWorkspace ? (
            <EmptyState
              title="No personal workspace yet"
              description="Create a personal workspace for quick, one-off signing tasks."
              actions={
                <button type="button" className="primary" onClick={() => setCreatePersonalOpen(true)} disabled={busy}>
                  Create personal workspace
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Completed requests will appear here. Start a request to generate a signed or filled file."
              actions={
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    onOpenRequests?.();
                    setTimeout(() => window.dispatchEvent(new CustomEvent("portal:requestsNew")), 0);
                  }}
                  disabled={busy}
                >
                  New request
                </button>
              }
            />
          ) : (
            filtered.map((flow) => {
              const title = flowTitle(flow);
              const rid = normalize(flow?.projectRoomId);
              const projectTitle = rid ? roomTitleById.get(rid) || "Project" : "Project";
              const completedAt = String(flow?.completedAt || flow?.updatedAt || flow?.createdAt || "");
              const archivedAt = normalize(flow?.archivedAt);
              return (
                <div key={normalize(flow?.resultFileId) || normalize(flow?.id)} className="list-row request-row">
                  <div className="list-main">
                    <strong className="truncate">{title}</strong>
                    <span className="muted request-row-meta">
                      <StatusPill tone={statusTone("Completed")}>Completed</StatusPill>{" "}
                      {archivedAt ? <StatusPill tone="gray">{`Archived: ${archivedAt.slice(0, 10)}`}</StatusPill> : null}{" "}
                      <StatusPill tone="gray">{projectTitle}</StatusPill>{" "}
                      <span className="muted">Updated {completedAt ? completedAt.slice(0, 19).replace("T", " ") : "-"}</span>
                    </span>
                  </div>
                  <div className="list-actions">
                    <button type="button" className="primary" onClick={() => openDoc(flow)} disabled={busy || !normalize(flow?.resultFileUrl || flow?.openUrl)}>
                      Open
                    </button>
                    <button type="button" onClick={() => openDetailsFromFlow(flow)} disabled={busy}>
                      Details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <Modal
        open={createPersonalOpen}
        title="Create personal workspace"
        onClose={() => {
          if (loading) return;
          setCreatePersonalOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setCreatePersonalOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const title = normalize(createPersonalTitle);
                if (!title || !token) return;
                setLoading(true);
                setError("");
                try {
                  await createProject({ token, title });
                  setCreatePersonalOpen(false);
                  window.dispatchEvent(new CustomEvent("portal:projectChanged"));
                  setTab("personal");
                } catch (e) {
                  setError(e?.message || "Failed to create personal workspace");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={busy || loading || !normalize(createPersonalTitle)}
            >
              {loading ? "Working..." : "Create"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>Name</span>
            <input value={createPersonalTitle} onChange={(e) => setCreatePersonalTitle(e.target.value)} disabled={busy || loading} />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Creates a private room in DocSpace and sets it as the current project.
          </p>
        </form>
      </Modal>

      <RequestDetailsModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsGroup(null);
        }}
        busy={busy || loading}
        group={detailsGroup}
        roomTitleById={roomTitleById}
        onOpen={(flow) => openDoc(flow)}
        onCopyLink={null}
        onNotify={null}
        onRemind={null}
        onActivity={null}
        onCancel={null}
        onComplete={null}
        canCancel={false}
        canComplete={false}
      />

      <DocSpaceModal open={docOpen} title={docTitle} url={docUrl} onClose={() => setDocOpen(false)} />
    </div>
  );
}
