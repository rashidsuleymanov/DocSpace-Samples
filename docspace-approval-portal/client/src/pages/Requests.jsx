import { useEffect, useMemo, useState } from "react";
import DocSpaceModal from "../components/DocSpaceModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Tabs from "../components/Tabs.jsx";
import { cancelFlow, completeFlow, getProjectMembers, getProjectsPermissions, inviteProject } from "../services/portalApi.js";

function isPdfTemplate(t) {
  const ext = String(t?.fileExst || "").trim().toLowerCase();
  const title = String(t?.title || "").trim().toLowerCase();
  return ext === "pdf" || ext === ".pdf" || title.endsWith(".pdf");
}

function normalizeEmailList(value) {
  const raw = String(value || "");
  const parts = raw.split(/[\n,;]+/g).map((s) => s.trim()).filter(Boolean);
  const uniq = new Set();
  for (const p of parts) uniq.add(p);
  return Array.from(uniq);
}

function withFillAction(url) {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set("action", "fill");
    return parsed.toString();
  } catch {
    return raw.includes("?") ? `${raw}&action=fill` : `${raw}?action=fill`;
  }
}

function normalizeKind(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "fillsign" || v === "fill-sign" || v === "fill_sign" || v === "sign") return "fillSign";
  if (v === "sharedsign" || v === "shared-sign" || v === "shared_sign" || v === "contract") return "sharedSign";
  return "approval";
}

export default function Requests({
  session,
  busy,
  error,
  flows,
  flowsRefreshing = false,
  flowsUpdatedAt = null,
  onRefreshFlows,
  activeRoomId,
  activeProject,
  projects = [],
  templates,
  initialFilter = "all",
  initialScope = "all",
  onBack,
  onStartFlow,
  onOpenDrafts,
  onOpenProjects
}) {
  const token = String(session?.token || "").trim();
  const meId = session?.user?.id ? String(session.user.id) : "";
  const meEmail = session?.user?.email ? String(session.user.email).trim().toLowerCase() : "";
  const updatedLabel = flowsUpdatedAt instanceof Date ? flowsUpdatedAt.toLocaleTimeString() : "";

  const [localError, setLocalError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(String(initialFilter || "all"));
  const [scope, setScope] = useState(String(initialScope || "all"));
  const [who, setWho] = useState("assigned");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendQuery, setSendQuery] = useState("");
  const [sendSelectedId, setSendSelectedId] = useState("");
  const [sendSelectedTitle, setSendSelectedTitle] = useState("");
  const [sendFlow, setSendFlow] = useState(null);
  const [sendFlows, setSendFlows] = useState([]);
  const [sendKind, setSendKind] = useState("approval");
  const [sendWarning, setSendWarning] = useState("");
  const [sendStep, setSendStep] = useState("setup"); // setup | recipients
  const [sendAdvanced, setSendAdvanced] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [members, setMembers] = useState([]);
  const [projectPerms, setProjectPerms] = useState({});
  const [permsLoaded, setPermsLoaded] = useState(false);

  const [pickedMemberIds, setPickedMemberIds] = useState(() => new Set());
  const [inviteEmails, setInviteEmails] = useState("");
  const [notify, setNotify] = useState(true);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("Document");
  const [modalUrl, setModalUrl] = useState("");

  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsGroup, setActionsGroup] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const hasProject = Boolean(String(activeRoomId || "").trim());
  const projectTitle = activeProject?.title || "";
  const projectId = activeProject?.id ? String(activeProject.id) : "";

  useEffect(() => {
    if (!token || permsLoaded) return;
    getProjectsPermissions({ token })
      .catch(() => null)
      .then((permsRes) => {
        setProjectPerms(permsRes?.permissions && typeof permsRes.permissions === "object" ? permsRes.permissions : {});
      })
      .finally(() => setPermsLoaded(true));
  }, [permsLoaded, token]);

  useEffect(() => {
    setStatusFilter(String(initialFilter || "all"));
  }, [initialFilter]);

  useEffect(() => {
    setScope(String(initialScope || "all"));
  }, [initialScope]);

  const filteredByScope = useMemo(() => {
    const items = Array.isArray(flows) ? flows : [];
    if (scope !== "current") return items;
    const rid = String(activeRoomId || "").trim();
    if (!rid) return [];
    return items.filter((f) => String(f?.projectRoomId || "") === rid);
  }, [activeRoomId, flows, scope]);

  const filteredByWho = useMemo(() => {
    const items = filteredByScope;
    if (who === "all") return items;
    if (who === "created") return items.filter((f) => String(f?.createdByUserId || "") === String(meId || ""));
    // assigned
    if (!meEmail) return [];
    return items.filter((f) => {
      const recipients = Array.isArray(f?.recipientEmails) ? f.recipientEmails : [];
      return recipients.map((e) => String(e || "").trim().toLowerCase()).includes(meEmail);
    });
  }, [filteredByScope, meEmail, meId, who]);

  const roomTitleById = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const map = new Map();
    for (const p of list) {
      const rid = String(p?.roomId || "").trim();
      if (!rid) continue;
      map.set(rid, String(p?.title || "").trim() || "Project");
    }
    return map;
  }, [projects]);

  const projectIdByRoomId = useMemo(() => {
    const list = Array.isArray(projects) ? projects : [];
    const map = new Map();
    for (const p of list) {
      const rid = String(p?.roomId || "").trim();
      const pid = String(p?.id || "").trim();
      if (!rid || !pid) continue;
      map.set(rid, pid);
    }
    return map;
  }, [projects]);

  const grouped = useMemo(() => {
    const items = filteredByWho;
    const byId = new Map();
    for (const flow of items) {
      if (!flow?.id) continue;
      const gid = String(flow?.groupId || flow.id).trim() || String(flow.id);
      const existing = byId.get(gid) || { id: gid, flows: [] };
      existing.flows.push(flow);
      byId.set(gid, existing);
    }

    const groups = Array.from(byId.values()).map((g) => {
      const flows = (g.flows || []).slice().sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
      const first = flows[0] || null;
      const total = flows.length;
      const completed = flows.filter((f) => String(f?.status || "") === "Completed").length;
      const canceled = flows.filter((f) => String(f?.status || "") === "Canceled").length;

      const status =
        total > 0 && completed === total ? "Completed" : total > 0 && canceled === total ? "Canceled" : "InProgress";

      const recipients = Array.from(
        new Set(
          flows
            .flatMap((f) => (Array.isArray(f?.recipientEmails) ? f.recipientEmails : []))
            .map((e) => String(e || "").trim().toLowerCase())
            .filter(Boolean)
        )
      );

      const assignedFlow =
        meEmail && recipients.includes(meEmail)
          ? flows.find((f) => Array.isArray(f?.recipientEmails) && f.recipientEmails.map((x) => String(x || "").trim().toLowerCase()).includes(meEmail)) ||
            null
          : null;

      const primaryFlow = assignedFlow || flows.find((f) => String(f?.status || "") !== "Canceled") || first;

      return {
        id: g.id,
        flows,
        primaryFlow,
        status,
        counts: { total, completed, canceled },
        projectRoomId: first?.projectRoomId || null,
        createdAt: first?.createdAt || null
      };
    });

    groups.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
    return groups;
  }, [filteredByWho, meEmail]);

  const filteredGroups = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const byStatus =
      statusFilter === "inProgress"
        ? grouped.filter((g) => g.status === "InProgress")
        : statusFilter === "completed"
          ? grouped.filter((g) => g.status === "Completed")
          : statusFilter === "other"
            ? grouped.filter((g) => g.status !== "InProgress" && g.status !== "Completed")
            : grouped;
    if (!q) return byStatus;
    return byStatus.filter((g) => {
      const flow = g.primaryFlow || g.flows?.[0] || {};
      const recipients = g.flows
        ? Array.from(
            new Set(
              g.flows
                .flatMap((f) => (Array.isArray(f?.recipientEmails) ? f.recipientEmails : []))
                .map((e) => String(e || "").trim().toLowerCase())
                .filter(Boolean)
            )
          )
        : [];
      const hay = `${flow.fileTitle || flow.templateTitle || flow.templateFileId || ""} ${recipients.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [grouped, query, statusFilter]);

  const scopeTabs = useMemo(
    () => [
      { id: "all", label: "All projects" },
      { id: "current", label: "Current project", disabled: !hasProject }
    ],
    [hasProject]
  );

  const whoTabs = useMemo(
    () => [
      { id: "assigned", label: "Assigned to me" },
      { id: "created", label: "Created by me" },
      { id: "all", label: "All" }
    ],
    []
  );

  const templateItems = Array.isArray(templates) ? templates : [];
  const filteredSendTemplates = useMemo(() => {
    const q = String(sendQuery || "").trim().toLowerCase();
    const pdfOnly = templateItems.filter(isPdfTemplate);
    if (!q) return pdfOnly;
    return pdfOnly.filter((t) => String(t.title || t.id || "").toLowerCase().includes(q));
  }, [sendQuery, templateItems]);

  const projectMembers = useMemo(() => {
    const items = Array.isArray(members) ? members : [];
    return items
      .filter((m) => m?.user?.id && (m?.user?.email || m?.user?.displayName))
      .map((m) => ({
        id: String(m.user.id),
        name: String(m.user.displayName || m.user.email || "User").trim(),
        email: String(m.user.email || "").trim(),
        isOwner: Boolean(m?.isOwner)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members]);

  const filteredProjectMembers = useMemo(() => {
    const q = String(memberQuery || "").trim().toLowerCase();
    if (!q) return projectMembers;
    return projectMembers.filter((m) => {
      const hay = `${m.name || ""} ${m.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [memberQuery, projectMembers]);

  const canManageProject = useMemo(() => {
    if (!projectId) return false;
    return Boolean(projectPerms?.[String(projectId)]);
  }, [projectId, projectPerms]);

  const selectedMemberEmails = useMemo(() => {
    const set = pickedMemberIds instanceof Set ? pickedMemberIds : new Set();
    const list = projectMembers.filter((m) => set.has(m.id) && m.email).map((m) => m.email);
    const uniq = new Set(list);
    return Array.from(uniq);
  }, [pickedMemberIds, projectMembers]);

  const allRecipientEmails = useMemo(() => {
    const fromPick = selectedMemberEmails;
    const fromInvite = normalizeEmailList(inviteEmails);
    const uniq = new Set([...(fromPick || []), ...(fromInvite || [])]);
    return Array.from(uniq);
  }, [inviteEmails, selectedMemberEmails]);

  useEffect(() => {
    if (!sendOpen) return;

    setSendSelectedId("");
    setSendSelectedTitle("");
    setSendFlow(null);
    setSendFlows([]);
    setSendKind("approval");
    setSendWarning("");
    setSendStep("setup");
    setSendAdvanced(false);
    setMemberQuery("");
    setSendQuery("");
    setPickedMemberIds(new Set());
    setInviteEmails("");
    setNotify(true);
    setNotifyMessage("");
    setMembersError("");

    if (!token || !projectId) {
      setMembers([]);
      setProjectPerms({});
      return;
    }

    setMembersLoading(true);
    Promise.all([
      getProjectMembers({ token, projectId }).catch((e) => {
        setMembersError(e?.message || "Failed to load project people");
        return null;
      }),
      getProjectsPermissions({ token }).catch(() => null)
    ])
      .then(([membersRes, permsRes]) => {
        setMembers(Array.isArray(membersRes?.members) ? membersRes.members : []);
        setProjectPerms(permsRes?.permissions && typeof permsRes.permissions === "object" ? permsRes.permissions : {});
      })
      .finally(() => setMembersLoading(false));
  }, [projectId, sendOpen, token]);

  // Permissions are enforced server-side (user token).

  const openFlow = (flow) => {
    if (String(flow?.status || "") === "Canceled") return;
    const status = String(flow?.status || "");
    const url = String((status === "Completed" ? flow?.resultFileUrl || flow?.openUrl : flow?.openUrl) || "").trim();
    if (!url) return;
    const kind = normalizeKind(flow?.kind);
    setModalTitle(flow?.fileTitle || flow?.templateTitle || "Document");
    setModalUrl((kind === "fillSign" || kind === "sharedSign") && status !== "Completed" ? withFillAction(url) : url);
    setModalOpen(true);
  };

  const canManageFlow = (flow) => {
    const rid = String(flow?.projectRoomId || "").trim();
    const pid = rid ? projectIdByRoomId.get(rid) : "";
    if (!pid) return false;
    return Boolean(projectPerms?.[String(pid)]);
  };

  const isAssignedToMe = (flow) => {
    const recipients = Array.isArray(flow?.recipientEmails) ? flow.recipientEmails : [];
    if (!meEmail || !recipients.length) return false;
    return recipients.map((e) => String(e || "").trim().toLowerCase()).includes(meEmail);
  };

  const onCancel = async (flow) => {
    const id = String(flow?.id || "").trim();
    if (!id || !token) return;
    setLocalError("");
    setActionBusy(true);
    try {
      await cancelFlow({ token, flowId: id });
      window.dispatchEvent(new CustomEvent("portal:flowsChanged"));
    } catch (e) {
      setLocalError(e?.message || "Failed to cancel request");
    } finally {
      setActionBusy(false);
    }
  };

  const onCancelGroup = async (group) => {
    const items = Array.isArray(group?.flows) ? group.flows : [];
    const ids = items.map((f) => String(f?.id || "").trim()).filter(Boolean);
    if (!ids.length || !token) return;
    setLocalError("");
    setActionBusy(true);
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await cancelFlow({ token, flowId: id }).catch(() => null);
      }
      window.dispatchEvent(new CustomEvent("portal:flowsChanged"));
    } catch (e) {
      setLocalError(e?.message || "Failed to cancel request");
    } finally {
      setActionBusy(false);
    }
  };

  const onComplete = async (flow) => {
    const id = String(flow?.id || "").trim();
    if (!id || !token) return;
    setLocalError("");
    setActionBusy(true);
    try {
      await completeFlow({ token, flowId: id });
      window.dispatchEvent(new CustomEvent("portal:flowsChanged"));
    } catch (e) {
      setLocalError(e?.message || "Failed to complete request");
    } finally {
      setActionBusy(false);
    }
  };

  const onNewRequest = () => {
    if (!hasProject) {
      onOpenProjects();
      return;
    }
    setSendOpen(true);
  };

  const onCopyLink = async (value) => {
    const url = String(value || "").trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore; user can copy manually
    }
  };

  const onCreateFlow = async () => {
    const templateFileId = String(sendSelectedId || "").trim();
    if (!templateFileId) return;
    if (!hasProject) return;
    const result = await onStartFlow?.(templateFileId, projectId, allRecipientEmails, sendKind);
    const flows = Array.isArray(result?.flows) ? result.flows : result?.flow ? [result.flow] : [];
    setSendFlows(flows);
    setSendFlow(flows[0] || null);
    setSendWarning(String(result?.warning || "").trim());
  };

  const onNotifyRecipients = async () => {
    if (!sendFlows.length) return;
    if (!projectId || !token) return;
    if (!canManageProject) return;

    const emails = allRecipientEmails;
    if (!emails.length) return;

    setNotifyBusy(true);
    try {
      const base = String(notifyMessage || "").trim();
      const portalUrl = typeof window !== "undefined" ? String(window.location?.origin || "").trim() : "";
      const finalMessage =
        sendKind === "fillSign"
          ? (() => {
              const link = String(sendFlow?.openUrl || "").trim();
              const defaultMsg = `You have a new document to fill and sign.${link ? `\n\nOpen: ${link}` : portalUrl ? `\n\nOpen: ${portalUrl}` : ""}`;
              return base || defaultMsg;
            })()
          : sendKind === "sharedSign"
            ? (() => {
                const link = String(sendFlow?.openUrl || "").trim();
                const defaultMsg = `You have a document to review and sign.${link ? `\n\nOpen: ${link}` : portalUrl ? `\n\nOpen: ${portalUrl}` : ""}`;
                return base || defaultMsg;
              })()
          : (() => {
              const link = String(sendFlow?.openUrl || "").trim();
              return base ? `${base}\n\nApproval link: ${link}` : `You have a new approval request.\n\nOpen: ${link}`;
            })();
      await inviteProject({
        token,
        projectId,
        emails: emails.join(","),
        access: "FillForms",
        notify: Boolean(notify),
        message: Boolean(notify) ? finalMessage : ""
      });
    } finally {
      setNotifyBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Requests</h2>
          <p className="muted">
            {hasProject ? `Tracking requests in “${projectTitle || "Current project"}”.` : "Pick a project to create and track requests."}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={onOpenProjects} disabled={busy}>
            Projects
          </button>
          <button type="button" onClick={onOpenDrafts} disabled={busy}>
            Templates
          </button>
          <button type="button" className="primary" onClick={onNewRequest} disabled={busy}>
            {hasProject ? "New request" : "Choose project"}
          </button>
        </div>
      </header>

      {error || localError ? <p className="error">{error || localError}</p> : null}

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>Requests</h3>
            <p className="muted">{scope === "current" ? "Showing only the current project." : "Showing all projects you can access."}</p>
          </div>
          <div className="card-header-actions">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              disabled={busy || (scope === "current" && !hasProject)}
              style={{ maxWidth: 260 }}
            />
            {flowsRefreshing ? (
              <span className="muted" style={{ fontSize: 12 }}>
                Updating…
              </span>
            ) : updatedLabel ? (
              <span className="muted" style={{ fontSize: 12 }}>
                Updated {updatedLabel}
              </span>
            ) : null}
            <span className="muted">{filteredGroups.length} shown</span>
            <button
              type="button"
              onClick={() => (typeof onRefreshFlows === "function" ? onRefreshFlows() : null)}
              disabled={busy || flowsRefreshing || !token}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="request-filters">
          <Tabs className="tabs-scope" value={scope} onChange={setScope} items={scopeTabs} ariaLabel="Project scope" />
          <Tabs className="tabs-who" value={who} onChange={setWho} items={whoTabs} ariaLabel="Requests scope" />
          <div className="chip-row" aria-label="Status filter">
            <button
              type="button"
              className={`chip${statusFilter === "all" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("all")}
              disabled={busy}
            >
              All
            </button>
            <button
              type="button"
              className={`chip${statusFilter === "inProgress" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("inProgress")}
              disabled={busy}
            >
              In progress
            </button>
            <button
              type="button"
              className={`chip${statusFilter === "completed" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("completed")}
              disabled={busy}
            >
              Completed
            </button>
            <button
              type="button"
              className={`chip${statusFilter === "other" ? " is-active" : ""}`}
              onClick={() => setStatusFilter("other")}
              disabled={busy}
            >
              Other
            </button>
          </div>
        </div>

        <div className="list">
          {scope === "current" && !hasProject ? (
            <EmptyState
              title="No project selected"
              description="Pick a project to see its requests."
              actions={
                <button type="button" className="primary" onClick={onOpenProjects} disabled={busy}>
                  Open Projects
                </button>
              }
            />
          ) : filteredGroups.length === 0 ? (
            who === "assigned" ? (
              <EmptyState
                title="No assigned requests"
                description="Requests assigned to your email will appear here."
                actions={
                  <button type="button" onClick={() => setWho("created")} disabled={busy}>
                    View created requests
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No requests yet"
                description="Create a request from a published template to share a link and track progress."
                actions={
                  <button type="button" className="primary" onClick={onNewRequest} disabled={busy}>
                    {hasProject ? "New request" : "Choose project"}
                  </button>
                }
              />
            )
          ) : (
            filteredGroups.map((group) => {
              const flow = group.primaryFlow || group.flows?.[0] || {};
              const title = flow.fileTitle || flow.templateTitle || `Template ${flow.templateFileId}`;
              const kindLower = String(flow?.kind || "").toLowerCase();
              const isFillSign = kindLower === "fillsign";
              const isSharedSign = kindLower === "sharedsign";
              const status = String(group.status || flow.status || "");
              const counts = group?.counts || { total: 1, completed: 0 };
              const meta = counts.total > 1 ? `${counts.completed || 0}/${counts.total} completed` : "";

              return (
              <div key={group.id} className="list-row request-row">
                <div className="list-main">
                  <strong className="truncate">{title}</strong>
                  <span className="muted request-row-meta">
                      {isFillSign ? <StatusPill tone="blue">Fill &amp; Sign</StatusPill> : null}{" "}
                      {isSharedSign ? <StatusPill tone="gray">Contract</StatusPill> : null}{" "}
                    {status === "Canceled" ? (
                      <StatusPill tone="red">Canceled</StatusPill>
                    ) : status === "InProgress" ? (
                      <StatusPill tone="yellow">In progress</StatusPill>
                    ) : status === "Completed" ? (
                      <StatusPill tone="green">Completed</StatusPill>
                    ) : (
                      <StatusPill tone="gray">{status || "-"}</StatusPill>
                    )}{" "}
                    {meta ? <StatusPill tone="gray">{meta}</StatusPill> : null}{" "}
                    {scope !== "current" ? (
                      <StatusPill tone="gray">
                        {(() => {
                          const rid = String(flow?.projectRoomId || group?.projectRoomId || "").trim();
                          if (!rid) return "Unassigned";
                          return roomTitleById.get(rid) || "Project";
                        })()}
                      </StatusPill>
                    ) : null}{" "}
                    <span className="muted">Created {(group.createdAt || flow.createdAt || "").slice(0, 19).replace("T", " ")}</span>
                  </span>
                </div>
                <div className="list-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => openFlow(flow)}
                    disabled={!(status === "Completed" ? flow?.resultFileUrl || flow?.openUrl : flow?.openUrl) || busy || status === "Canceled"}
                    title={status === "Canceled" ? "Canceled requests cannot be opened" : ""}
                  >
                    Open
                  </button>
                  {(canManageFlow(flow) || (String(flow?.kind || "").toLowerCase() === "sharedsign" && isAssignedToMe(flow))) &&
                  status !== "Completed" &&
                  status !== "Canceled" ? (
                    <button
                      type="button"
                      className="projects-more"
                      onClick={() => {
                        setActionsGroup(group);
                        setActionsOpen(true);
                      }}
                      disabled={busy || actionBusy}
                      aria-label="Request actions"
                      title="Actions"
                    >
                      …
                    </button>
                  ) : null}
                </div>
              </div>
              );
            })
          )}
        </div>
      </section>

      <Modal
        open={sendOpen}
        title={
          projectTitle
            ? `${sendKind === "fillSign" || sendKind === "sharedSign" ? "Request signature" : "New request"} — ${projectTitle}`
            : sendKind === "fillSign" || sendKind === "sharedSign"
              ? "Request signature"
              : "New request"
        }
        onClose={() => setSendOpen(false)}
        footer={
          <>
            {!sendFlows.length ? (
              <>
                {sendStep === "recipients" ? (
                  <button type="button" onClick={() => setSendStep("setup")} disabled={busy}>
                    Back
                  </button>
                ) : (
                  <button type="button" onClick={() => setSendOpen(false)} disabled={busy}>
                    Cancel
                  </button>
                )}

                {sendStep === "setup" ? (
                  <button type="button" className="primary" onClick={() => setSendStep("recipients")} disabled={busy || !sendSelectedId}>
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={onCreateFlow}
                    disabled={
                      busy ||
                      !sendSelectedId ||
                      ((sendKind === "fillSign" || sendKind === "sharedSign") && allRecipientEmails.length === 0)
                    }
                  >
                    {sendKind === "fillSign" || sendKind === "sharedSign" ? "Send for signature" : "Create request"}
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => setSendOpen(false)} disabled={busy || notifyBusy}>
                  Close
                </button>
                {sendKind !== "fillSign" ? (
                  <button type="button" onClick={() => onCopyLink(sendFlow?.openUrl)} disabled={busy || notifyBusy || !sendFlow?.openUrl}>
                    Copy link
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primary"
                  onClick={onNotifyRecipients}
                  disabled={busy || notifyBusy || !canManageProject || allRecipientEmails.length === 0}
                  title={!canManageProject ? "Only the project admin can notify people" : ""}
                >
                  {notifyBusy ? "Sending..." : notify ? "Notify people" : "Add people"}
                </button>
              </>
            )}
          </>
        }
      >
        {!templateItems.length ? (
          <EmptyState
            title="No published templates in this project"
            description="Create a template, publish it to a project, then start a request."
            actions={
              <button type="button" className="primary" onClick={onOpenDrafts} disabled={busy}>
                Open Templates
              </button>
            }
          />
        ) : (
          <div className="request-wizard">
            {!sendFlows.length ? (
              <div className="wizard-stepper" aria-label="New request steps">
                <button
                  type="button"
                  className={`wizard-step${sendStep === "setup" ? " is-active" : ""}`}
                  onClick={() => setSendStep("setup")}
                  disabled={busy}
                >
                  1. Template
                </button>
                <span className="wizard-step-sep" aria-hidden="true" />
                <button
                  type="button"
                  className={`wizard-step${sendStep === "recipients" ? " is-active" : ""}`}
                  onClick={() => setSendStep("recipients")}
                  disabled={busy || !sendSelectedId}
                  title={!sendSelectedId ? "Choose a template first" : ""}
                >
                  2. Recipients
                </button>
              </div>
            ) : null}
            {!sendFlows.length && sendStep === "setup" ? (
              <>
            <div className="wizard-section">
              <div className="wizard-head">
                <strong>Request type</strong>
                <span className="muted">Choose what recipients should do.</span>
              </div>
              <div className="chip-row">
                <button
                  type="button"
                  className={`chip${sendKind === "approval" ? " is-active" : ""}`}
                  onClick={() => setSendKind("approval")}
                  disabled={busy}
                >
                  Approval
                </button>
                <button
                  type="button"
                  className={`chip${sendKind === "fillSign" ? " is-active" : ""}`}
                  onClick={() => setSendKind("fillSign")}
                  disabled={busy}
                >
                  Fill &amp; Sign
                </button>
                <button
                  type="button"
                  className={`chip${sendKind === "sharedSign" ? " is-active" : ""}`}
                  onClick={() => setSendKind("sharedSign")}
                  disabled={busy}
                >
                  Contract (one document)
                </button>
              </div>
              <p className="muted" style={{ margin: "10px 0 0" }}>
                {sendKind === "fillSign"
                  ? "Creates a signing request for each selected recipient. Each person signs their own copy."
                  : sendKind === "sharedSign"
                    ? "Creates one shared document in the project signing room. Everyone signs the same file."
                  : "Creates a shareable link you can send to recipients."}
              </p>
            </div>
            <div className="wizard-section">
              <div className="wizard-head">
                <strong>1) Choose a template</strong>
                {sendSelectedTitle ? <span className="muted truncate">Selected: {sendSelectedTitle}</span> : null}
              </div>
              <div className="auth-form" style={{ marginTop: 0 }}>
                <label>
                  <span>Template</span>
                  <input
                    value={sendQuery}
                    onChange={(e) => setSendQuery(e.target.value)}
                    placeholder="Search templates..."
                    disabled={busy}
                  />
                </label>
              </div>
              <div className="list" style={{ marginTop: 0 }}>
                {filteredSendTemplates.slice(0, 8).map((t) => {
                  const selected = String(sendSelectedId) === String(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`select-row${selected ? " is-selected" : ""}`}
                      onClick={() => {
                        setSendSelectedId(String(t.id));
                        setSendSelectedTitle(String(t.title || `File ${t.id}`));
                      }}
                      disabled={busy}
                    >
                      <div className="select-row-main">
                        <strong className="truncate">{t.title || `File ${t.id}`}</strong>
                        <span className="muted truncate">ID: {t.id}</span>
                      </div>
                      <span className="select-row-right" aria-hidden="true">{selected ? "✓" : "›"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
              </>
            ) : null}

            {(!sendFlows.length && sendStep === "recipients") || sendFlows.length ? <div className="wizard-divider" /> : null}

            {!sendFlows.length && sendStep === "recipients" ? (
                <div className="wizard-section">
                  <div className="wizard-head">
                    <div style={{ display: "grid", gap: 2 }}>
                      <strong>2) Recipients {sendKind === "fillSign" || sendKind === "sharedSign" ? "" : "(optional)"}</strong>
                      <span className="muted">
                        {sendKind === "fillSign" || sendKind === "sharedSign"
                          ? "Pick at least one person to sign."
                          : "Pick people to notify, or invite new people to this project."}
                      </span>
                    </div>
                    {canManageProject ? (
                      <button
                        type="button"
                        className="link"
                        onClick={() => setSendAdvanced((v) => !v)}
                        disabled={busy}
                        title="Invite people by email and add a message"
                      >
                        {sendAdvanced ? "Hide options" : "Invite & message"}
                      </button>
                    ) : null}
                  </div>

                {membersLoading ? (
                  <EmptyState title="Loading people…" />
                ) : (
                  <div className={`recipient-grid${sendAdvanced && canManageProject ? "" : " is-single"}`}>
                    <div className="recipient-panel">
                      <div className="recipient-head">
                        <strong>People in this project</strong>
                        <span className="muted">{projectMembers.length} total</span>
                      </div>
                      <div className="auth-form" style={{ marginTop: 0 }}>
                        <label>
                          <span>Search</span>
                          <input
                            value={memberQuery}
                            onChange={(e) => setMemberQuery(e.target.value)}
                            placeholder="Search people…"
                            disabled={busy}
                          />
                        </label>
                      </div>
                      {membersError ? <p className="error" style={{ margin: 0 }}>{membersError}</p> : null}
                      {!projectMembers.length ? (
                        <EmptyState title="No people found" description="Invite someone to this project to notify them." />
                      ) : !filteredProjectMembers.length ? (
                        <EmptyState title="No matches" description="Try a different search." />
                      ) : (
                        <div className="member-list">
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={filteredProjectMembers.length > 0 && filteredProjectMembers.every((m) => pickedMemberIds.has(m.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const next = new Set(pickedMemberIds);
                                  for (const m of filteredProjectMembers) next.add(m.id);
                                  setPickedMemberIds(next);
                                  return;
                                }
                                const next = new Set(pickedMemberIds);
                                for (const m of filteredProjectMembers) next.delete(m.id);
                                setPickedMemberIds(next);
                              }}
                              disabled={busy}
                            />
                            <span>Select all shown</span>
                          </label>
                          {filteredProjectMembers.map((m) => (
                            <label key={m.id} className="check-row">
                              <input
                                type="checkbox"
                                checked={pickedMemberIds.has(m.id)}
                                onChange={(e) => {
                                  const next = new Set(pickedMemberIds);
                                  if (e.target.checked) next.add(m.id);
                                  else next.delete(m.id);
                                  setPickedMemberIds(next);
                                }}
                                disabled={busy}
                              />
                              <span className="truncate">
                                {m.name}{m.email ? ` — ${m.email}` : ""}{m.isOwner ? " (Admin)" : ""}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      {!canManageProject ? (
                        <p className="muted" style={{ margin: 0 }}>
                          Only the project admin can send notifications or invite new people.
                        </p>
                      ) : null}
                    </div>

                    {sendAdvanced && canManageProject ? (
                    <div className="recipient-panel">
                      <div className="recipient-head">
                        <strong>Invite new people</strong>
                        <span className="muted">Admin only</span>
                      </div>
                      <div className="auth-form" style={{ marginTop: 0 }}>
                        <label>
                          <span>Emails (comma / new line)</span>
                          <textarea
                            value={inviteEmails}
                            onChange={(e) => setInviteEmails(e.target.value)}
                            disabled={busy || !canManageProject}
                          />
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={Boolean(notify)}
                            onChange={(e) => setNotify(e.target.checked)}
                            disabled={busy || !canManageProject}
                          />
                          <span>Send notification</span>
                        </label>
                        <label>
                          <span>Message (optional)</span>
                          <input
                            value={notifyMessage}
                            onChange={(e) => setNotifyMessage(e.target.value)}
                            disabled={busy || !canManageProject || !notify}
                            placeholder="Short note for recipients…"
                          />
                        </label>
                        <p className="muted" style={{ margin: 0 }}>
                          {sendKind === "fillSign"
                            ? "After sending, people will see the document in their Requests inbox."
                            : sendKind === "sharedSign"
                              ? "After sending, people will open the shared signing link."
                              : "After creating the request you can notify people and include the approval link."}
                        </p>
                      </div>
                    </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {sendFlows.length ? (
              <div className="wizard-section">
                <div className="wizard-head">
                  <strong>Request created</strong>
                  <span className="muted">
                    {sendKind === "fillSign"
                      ? "Recipients can sign from their Requests inbox."
                      : sendKind === "sharedSign"
                        ? "Copy the signing link or notify people from this project."
                        : "Copy the link or notify people from this project."}
                  </span>
                </div>
                {sendWarning ? <p className="notice">{sendWarning}</p> : null}
                <div className="auth-form" style={{ marginTop: 0 }}>
                  {sendKind !== "fillSign" ? (
                    <>
                      <label>
                        <span>{sendKind === "sharedSign" ? "Signing link" : "Approval link"}</span>
                        <input value={String(sendFlow?.openUrl || "")} readOnly />
                      </label>
                      {sendKind === "sharedSign" ? (
                        <p className="muted" style={{ margin: "0 0 10px" }}>
                          Stored in{" "}
                          <strong>{String(sendFlow?.documentRoomTitle || "Signing room")}</strong>.
                        </p>
                      ) : null}
                      <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
                        <button type="button" onClick={() => onCopyLink(sendFlow?.openUrl)} disabled={busy || notifyBusy || !sendFlow?.openUrl}>
                          Copy link
                        </button>
                        {sendKind === "sharedSign" && sendFlow?.documentRoomUrl ? (
                          <a className="btn subtle" href={String(sendFlow.documentRoomUrl)} target="_blank" rel="noreferrer">
                            Open signing room
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="primary"
                          onClick={onNotifyRecipients}
                          disabled={busy || notifyBusy || !canManageProject || allRecipientEmails.length === 0}
                          title={!canManageProject ? "Only the project admin can notify people" : ""}
                        >
                          {notifyBusy ? "Sending..." : notify ? `Notify (${allRecipientEmails.length})` : `Add (${allRecipientEmails.length})`}
                        </button>
                        <button type="button" className="link" onClick={onOpenDrafts} disabled={busy || notifyBusy}>
                          Templates
                        </button>
                      </div>
                      <p className="muted" style={{ margin: 0 }}>
                        Recipients: {allRecipientEmails.length ? allRecipientEmails.join(", ") : "none"}.
                      </p>
                    </>
                  ) : (
                    <>
                      <label>
                        <span>Signing link</span>
                        <input value={String(sendFlow?.openUrl || "")} readOnly />
                      </label>
                      <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
                        <button type="button" onClick={() => onCopyLink(sendFlow?.openUrl)} disabled={busy || notifyBusy || !sendFlow?.openUrl}>
                          Copy link
                        </button>
                      </div>
                      <p className="muted" style={{ margin: 0 }}>
                        Recipients: {allRecipientEmails.length ? allRecipientEmails.join(", ") : "none"}.
                      </p>
                      <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
                        <button
                          type="button"
                          className="primary"
                          onClick={onNotifyRecipients}
                          disabled={busy || notifyBusy || !canManageProject || allRecipientEmails.length === 0}
                          title={!canManageProject ? "Only the project admin can notify people" : ""}
                        >
                          {notifyBusy ? "Sending..." : notify ? `Notify (${allRecipientEmails.length})` : `Add (${allRecipientEmails.length})`}
                        </button>
                        <button type="button" className="link" onClick={onOpenDrafts} disabled={busy || notifyBusy}>
                          Templates
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={actionsOpen}
        title={(() => {
          const flow = actionsGroup?.primaryFlow || actionsGroup?.flows?.[0] || null;
          const title = flow?.fileTitle || flow?.templateTitle || "";
          return title ? `Request actions — ${title}` : "Request actions";
        })()}
        onClose={() => {
          setActionsOpen(false);
          setActionsGroup(null);
        }}
      >
        <div className="action-sheet">
          <button
            type="button"
            className="primary"
            onClick={() => {
              const flow = actionsGroup?.primaryFlow || actionsGroup?.flows?.[0] || null;
              if (flow) openFlow(flow);
              setActionsOpen(false);
              setActionsGroup(null);
            }}
            disabled={
              !(actionsGroup?.primaryFlow || actionsGroup?.flows?.[0])?.openUrl ||
              busy ||
              actionBusy ||
              String(actionsGroup?.status || "") === "Canceled"
            }
          >
            Open
          </button>
          {(() => {
            const flow = actionsGroup?.primaryFlow || actionsGroup?.flows?.[0] || null;
            const kind = String(flow?.kind || "").toLowerCase();
            const isAssigned = isAssignedToMe(flow);
            const canManage = canManageFlow(flow);
            const canComplete =
              kind === "sharedsign" &&
              (isAssigned || canManage) &&
              String(flow?.status || "") !== "Completed" &&
              String(flow?.status || "") !== "Canceled";
            if (!canComplete) return null;
            return (
              <button
                type="button"
                className="primary"
                onClick={() => setCompleteOpen(true)}
                disabled={busy || actionBusy}
              >
                Complete
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => onCopyLink((actionsGroup?.primaryFlow || actionsGroup?.flows?.[0])?.openUrl)}
            disabled={busy || actionBusy || !(actionsGroup?.primaryFlow || actionsGroup?.flows?.[0])?.openUrl}
          >
            Copy link
          </button>
          {(() => {
            const flow = actionsGroup?.primaryFlow || actionsGroup?.flows?.[0] || null;
            const canCancel = canManageFlow(flow);
            if (!canCancel) return null;
            return (
              <button
                type="button"
                className="danger"
                onClick={() => setCancelOpen(true)}
                disabled={busy || actionBusy || !actionsGroup?.flows?.length || String(actionsGroup?.status || "") === "Completed"}
              >
                Cancel request
              </button>
            );
          })()}
        </div>
      </Modal>

      <Modal
        open={completeOpen}
        title="Mark as complete?"
        onClose={() => setCompleteOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setCompleteOpen(false)} disabled={busy || actionBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const flow = actionsGroup?.primaryFlow || actionsGroup?.flows?.[0] || null;
                setCompleteOpen(false);
                setActionsOpen(false);
                setActionsGroup(null);
                await onComplete(flow);
              }}
              disabled={busy || actionBusy || !(actionsGroup?.primaryFlow || actionsGroup?.flows?.[0])?.id}
            >
              {actionBusy ? "Working..." : "Complete"}
            </button>
          </>
        }
      >
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>Confirm that you finished signing.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            This updates the status in the portal for your recipient entry.
          </p>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        title="Cancel request?"
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setCancelOpen(false)} disabled={busy || actionBusy}>
              Keep
            </button>
            <button
              type="button"
              className="danger"
              onClick={async () => {
                const group = actionsGroup;
                setCancelOpen(false);
                setActionsOpen(false);
                setActionsGroup(null);
                await onCancelGroup(group);
              }}
              disabled={busy || actionBusy || !actionsGroup?.flows?.length}
            >
              {actionBusy ? "Working..." : "Cancel request"}
            </button>
          </>
        }
      >
        <div className="empty" style={{ marginTop: 0 }}>
          <strong>This marks the request as canceled in the portal.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            It won’t delete any DocSpace files or revoke access.
          </p>
        </div>
      </Modal>

      <DocSpaceModal open={modalOpen} title={modalTitle} url={modalUrl} onClose={() => setModalOpen(false)} />
    </div>
  );
}
