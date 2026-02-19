import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import Tabs from "../components/Tabs.jsx";
import {
  createDirectoryGroup,
  createDirectoryPerson,
  deleteDirectoryGroup,
  deleteDirectoryPerson,
  getDirectoryGroup,
  inviteDirectoryPeople,
  listDirectoryGroups,
  listDirectoryPeople,
  removeDirectoryGroupMembers,
  searchDirectoryPeople,
  updateDirectoryGroup
} from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function normalizeEmailList(value) {
  const raw = String(value || "");
  const parts = raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

export default function Contacts({ session, busy, onOpenBulk }) {
  const token = normalize(session?.token);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState("people"); // people | groups

  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peopleOffset, setPeopleOffset] = useState(0);

  const [groups, setGroups] = useState([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);

  const [managePeopleOpen, setManagePeopleOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [manageGroupOpen, setManageGroupOpen] = useState(false);

  const [personEmail, setPersonEmail] = useState("");
  const [personFirstName, setPersonFirstName] = useState("");
  const [personLastName, setPersonLastName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupManagerEmail, setNewGroupManagerEmail] = useState("");
  const [newGroupMemberEmails, setNewGroupMemberEmails] = useState("");
  const [groupAddEmails, setGroupAddEmails] = useState("");
  const [groupRename, setGroupRename] = useState("");
  const [groupManagerEmail, setGroupManagerEmail] = useState("");

  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerPeople, setPickerPeople] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [pickerOffset, setPickerOffset] = useState(0);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [createPickedMemberIds, setCreatePickedMemberIds] = useState(() => new Set());
  const [managePickedMemberIds, setManagePickedMemberIds] = useState(() => new Set());

  const [pickedEmails, setPickedEmails] = useState(() => new Set());

  const selectedCount = pickedEmails instanceof Set ? pickedEmails.size : 0;

  const selectedEmails = useMemo(() => Array.from(pickedEmails instanceof Set ? pickedEmails : []), [pickedEmails]);

  const refreshGroups = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await listDirectoryGroups({ token });
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch (e) {
      setGroups([]);
      setError(e?.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  };

  const refreshPeople = async ({ offset = 0, append = false } = {}) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await listDirectoryPeople({ token, offset, limit: 25 });
      const list = Array.isArray(data?.people) ? data.people : [];
      const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : list.length;
      setPeopleOffset(offset);
      setPeopleTotal(total);
      setPeople((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
    } catch (e) {
      if (!append) setPeople([]);
      setPeopleTotal(0);
      setError(e?.message || "Failed to load people");
    } finally {
      setLoading(false);
    }
  };

  const refreshSelectedGroupMembers = async (gid) => {
    const id = normalize(gid || groupId);
    if (!token || !id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getDirectoryGroup({ token, groupId: id });
      setGroupMembers(Array.isArray(data?.members) ? data.members : []);
    } catch (e) {
      setGroupMembers([]);
      setError(e?.message || "Failed to load group members");
    } finally {
      setLoading(false);
    }
  };

  const refreshPicker = async ({ query = "", offset = 0, append = false } = {}) => {
    if (!token) return;
    const q = String(query || "").trim();
    setPickerLoading(true);
    setPickerError("");
    try {
      if (q) {
        const data = await searchDirectoryPeople({ token, query: q });
        const list = Array.isArray(data?.people) ? data.people : [];
        setPickerOffset(0);
        setPickerTotal(list.length);
        setPickerPeople(list);
        return;
      }

      const data = await listDirectoryPeople({ token, offset, limit: 50 });
      const list = Array.isArray(data?.people) ? data.people : [];
      const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : list.length;
      setPickerOffset(offset);
      setPickerTotal(total);
      setPickerPeople((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
    } catch (e) {
      if (!append) setPickerPeople([]);
      setPickerOffset(0);
      setPickerTotal(0);
      setPickerError(e?.message || "Failed to load people");
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    refreshGroups().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (mode !== "people") return;
    const q = normalize(peopleQuery);
    if (!q) {
      refreshPeople({ offset: 0, append: false }).catch(() => null);
      return;
    }

    setPeopleTotal(0);
    setPeopleOffset(0);
    setError("");
    const handle = setTimeout(() => {
      setLoading(true);
      searchDirectoryPeople({ token, query: q })
        .then((data) => setPeople(Array.isArray(data?.people) ? data.people : []))
        .catch((e) => {
          setPeople([]);
          setError(e?.message || "Failed to search people");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [mode, peopleQuery, token]);

  useEffect(() => {
    if (!token) return;
    if (mode !== "groups") return;
    const gid = normalize(groupId);
    if (!gid) {
      setGroupMembers([]);
      return;
    }
    refreshSelectedGroupMembers(gid).catch(() => null);
  }, [groupId, mode, token]);

  const toggleEmail = (email, on) => {
    const em = normalizeEmail(email);
    if (!em) return;
    setPickedEmails((prev) => {
      const next = new Set(prev instanceof Set ? prev : []);
      if (on) next.add(em);
      else next.delete(em);
      return next;
    });
  };

  const clearSelection = () => setPickedEmails(new Set());

  const sendToBulk = () => {
    if (!selectedEmails.length) return;
    window.dispatchEvent(new CustomEvent("portal:bulkRecipients", { detail: { emails: selectedEmails } }));
    onOpenBulk?.();
  };

  const filteredGroups = useMemo(() => {
    const q = normalize(groupQuery).toLowerCase();
    const list = Array.isArray(groups) ? groups : [];
    if (!q) return list;
    return list.filter((g) => String(g?.name || "").toLowerCase().includes(q));
  }, [groupQuery, groups]);

  const rows = mode === "groups" ? groupMembers : people;
  const shownEmails = useMemo(() => {
    const items = Array.isArray(rows) ? rows : [];
    return items.map((p) => normalizeEmail(p?.email)).filter(Boolean);
  }, [rows]);

  const allShownSelected = useMemo(() => {
    if (!(pickedEmails instanceof Set)) return false;
    if (!shownEmails.length) return false;
    return shownEmails.every((e) => pickedEmails.has(e));
  }, [pickedEmails, shownEmails]);

  const toggleAllShown = (on) => {
    setPickedEmails((prev) => {
      const next = new Set(prev instanceof Set ? prev : []);
      if (on) {
        for (const em of shownEmails) next.add(em);
      } else {
        for (const em of shownEmails) next.delete(em);
      }
      return next;
    });
  };
  const selectedGroup = useMemo(() => {
    const gid = normalize(groupId);
    if (!gid) return null;
    return (Array.isArray(groups) ? groups : []).find((g) => normalize(g?.id) === gid) || null;
  }, [groupId, groups]);

  const canManageDirectory = Boolean(token); // Server will enforce permissions; UI keeps it simple.

  useEffect(() => {
    if (mode !== "groups") return;
    setGroupRename(selectedGroup?.name || "");
    setGroupManagerEmail("");
    setGroupAddEmails("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, groupId]);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Contacts</h2>
          <p className="muted">Use DocSpace people and groups as recipients.</p>
        </div>
        <div className="topbar-actions">
          {mode === "people" ? (
            <button
              type="button"
              onClick={() => {
                setManagePeopleOpen(true);
                setNotice("");
                setError("");
              }}
              disabled={busy || loading || !canManageDirectory}
              title="Manage people in DocSpace (requires permissions)"
            >
              Manage people
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreateGroupOpen(true);
                setNotice("");
                setError("");
                setPickerQuery("");
                setPickerPeople([]);
                setCreatePickedMemberIds(new Set());
                refreshPicker({ query: "", offset: 0, append: false }).catch(() => null);
              }}
              disabled={busy || loading || !canManageDirectory}
              title="Create a DocSpace group (requires permissions)"
            >
              Create group
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setError("");
              refreshGroups().catch(() => null);
            }}
            disabled={busy || loading}
          >
            Refresh
          </button>
          <button type="button" onClick={clearSelection} disabled={busy || loading || selectedCount === 0}>
            Clear ({selectedCount})
          </button>
          <button type="button" className="primary" onClick={sendToBulk} disabled={busy || loading || selectedCount === 0} title="Send to Bulk send">
            Bulk send ({selectedCount})
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <Modal
        open={managePeopleOpen}
        title="Manage people"
        onClose={() => {
          setManagePeopleOpen(false);
          setError("");
          setNotice("");
        }}
        actions={
          <button type="button" onClick={() => setManagePeopleOpen(false)}>
            Close
          </button>
        }
      >
        <div className="auth-form" style={{ marginTop: 0 }}>
          <>
              <div>
                <strong>Add person</strong>
                <p className="muted" style={{ marginTop: 4 }}>
                  Creates a DocSpace user profile (if your token has permissions).
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <label>
                  <span>Email</span>
                  <input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="name@company.com" disabled={busy || loading} />
                </label>
                <label>
                  <span>First name</span>
                  <input value={personFirstName} onChange={(e) => setPersonFirstName(e.target.value)} placeholder="First" disabled={busy || loading} />
                </label>
                <label>
                  <span>Last name</span>
                  <input value={personLastName} onChange={(e) => setPersonLastName(e.target.value)} placeholder="Last" disabled={busy || loading} />
                </label>
              </div>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  if (!token) return;
                  setError("");
                  setNotice("");
                  const email = normalizeEmail(personEmail);
                  if (!email) {
                    setError("Email is required");
                    return;
                  }
                  setLoading(true);
                  try {
                    await createDirectoryPerson({
                      token,
                      email,
                      firstName: normalize(personFirstName),
                      lastName: normalize(personLastName)
                    });
                    setNotice("User created in DocSpace.");
                    setPersonEmail("");
                    setPersonFirstName("");
                    setPersonLastName("");
                    await refreshPeople({ offset: 0, append: false });
                  } catch (e) {
                    setError(e?.message || "Failed to create user");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={busy || loading}
              >
                Add person
              </button>

              <hr />

              <div>
                <strong>Invite people</strong>
                <p className="muted" style={{ marginTop: 4 }}>
                  Sends DocSpace invites (if enabled on the server).
                </p>
              </div>
              <label>
                <span>Emails (comma / new line)</span>
                <textarea value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} placeholder="a@company.com, b@company.com" disabled={busy || loading || inviteBusy} />
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (!token) return;
                  const emails = normalizeEmailList(inviteEmails || personEmail);
                  if (!emails.length) {
                    setError("Emails are required for invite");
                    return;
                  }
                  setInviteBusy(true);
                  setError("");
                  setNotice("");
                  try {
                    await inviteDirectoryPeople({ token, emails });
                    setNotice("Invites sent (if allowed by DocSpace).");
                    setInviteEmails("");
                  } catch (e) {
                    setError(e?.message || "Failed to invite people");
                  } finally {
                    setInviteBusy(false);
                  }
                }}
                disabled={busy || loading || inviteBusy}
              >
                Invite
              </button>
          </>
        </div>
      </Modal>

      <Modal
        open={createGroupOpen}
        title="Create group"
        onClose={() => {
          setCreateGroupOpen(false);
          setError("");
          setNotice("");
        }}
        actions={
          <button type="button" onClick={() => setCreateGroupOpen(false)}>
            Close
          </button>
        }
      >
        <div className="auth-form" style={{ marginTop: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <label>
              <span>Group name</span>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Finance approvals" disabled={busy || loading} />
            </label>
            <label>
              <span>Manager email (optional)</span>
              <input value={newGroupManagerEmail} onChange={(e) => setNewGroupManagerEmail(e.target.value)} placeholder="manager@company.com" disabled={busy || loading} />
            </label>
          </div>

          <label>
            <span>Member emails (optional)</span>
            <textarea value={newGroupMemberEmails} onChange={(e) => setNewGroupMemberEmails(e.target.value)} placeholder="a@company.com, b@company.com" disabled={busy || loading} />
          </label>

          <div className="card" style={{ margin: 0, padding: 12 }}>
            <div className="recipient-head" style={{ padding: 0, marginBottom: 8 }}>
              <strong>Pick members</strong>
              <span className="muted">{createPickedMemberIds instanceof Set ? createPickedMemberIds.size : 0} selected</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={pickerQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setPickerQuery(q);
                  refreshPicker({ query: q, offset: 0, append: false }).catch(() => null);
                }}
                placeholder="Search people..."
                disabled={busy || loading || pickerLoading}
                style={{ maxWidth: 420 }}
              />
              <button
                type="button"
                onClick={() => {
                  setPickerQuery("");
                  refreshPicker({ query: "", offset: 0, append: false }).catch(() => null);
                }}
                disabled={busy || loading || pickerLoading}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setCreatePickedMemberIds(new Set())}
                disabled={busy || loading || pickerLoading || !(createPickedMemberIds instanceof Set ? createPickedMemberIds.size : 0)}
              >
                Clear
              </button>
            </div>
            {pickerError ? <p className="error" style={{ marginTop: 10 }}>{pickerError}</p> : null}
            {pickerLoading ? <EmptyState title="Loading people..." /> : null}
            {!pickerLoading && Array.isArray(pickerPeople) && pickerPeople.length ? (
              <div className="member-list is-compact" style={{ marginTop: 10 }}>
                {pickerPeople.map((u) => {
                  const id = String(u?.id || "").trim();
                  if (!id) return null;
                  const email = String(u?.email || "").trim();
                  const name = String(u?.displayName || u?.name || email || "User").trim();
                  const checked = createPickedMemberIds instanceof Set ? createPickedMemberIds.has(id) : false;
                  return (
                    <label key={id} className="check-row" title={email || id}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked)}
                        onChange={(e) => {
                          const next = new Set(createPickedMemberIds instanceof Set ? createPickedMemberIds : []);
                          if (e.target.checked) next.add(id);
                          else next.delete(id);
                          setCreatePickedMemberIds(next);
                        }}
                        disabled={busy || loading || pickerLoading}
                      />
                      <span className="truncate">
                        <strong>{name}</strong>
                        {email ? <span className="muted">{" "}- {email}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            {!pickerLoading && !pickerQuery && pickerTotal > 0 && Array.isArray(pickerPeople) && pickerPeople.length < pickerTotal ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                <button type="button" onClick={() => refreshPicker({ query: "", offset: pickerPeople.length, append: true })} disabled={busy || loading || pickerLoading}>
                  Load more
                </button>
                <span className="muted">
                  Showing {pickerPeople.length} of {pickerTotal}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                if (!token) return;
                const name = normalize(newGroupName);
                if (!name) {
                  setError("Group name is required");
                  return;
                }
                const memberIds = Array.from(createPickedMemberIds instanceof Set ? createPickedMemberIds : []);
                setLoading(true);
                setError("");
                setNotice("");
                try {
                  await createDirectoryGroup({
                    token,
                    groupName: name,
                    managerEmail: normalizeEmail(newGroupManagerEmail),
                    memberEmails: newGroupMemberEmails,
                    memberIds
                  });
                  setNotice("Group created in DocSpace.");
                  setNewGroupName("");
                  setNewGroupManagerEmail("");
                  setNewGroupMemberEmails("");
                  setCreatePickedMemberIds(new Set());
                  setCreateGroupOpen(false);
                  await refreshGroups();
                } catch (e) {
                  setError(e?.message || "Failed to create group");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={busy || loading}
            >
              Create group
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={manageGroupOpen}
        title={`Manage group${selectedGroup?.name ? ` — ${selectedGroup.name}` : ""}`}
        onClose={() => {
          setManageGroupOpen(false);
          setError("");
          setNotice("");
        }}
        actions={
          <button type="button" onClick={() => setManageGroupOpen(false)}>
            Close
          </button>
        }
      >
        <div className="auth-form" style={{ marginTop: 0 }}>
          {!normalize(groupId) ? (
            <EmptyState title="No group selected" description="Select a group and click Manage." />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <label>
                  <span>Rename group</span>
                  <input value={groupRename} onChange={(e) => setGroupRename(e.target.value)} placeholder={selectedGroup?.name || "Group name"} disabled={busy || loading} />
                </label>
                <label>
                  <span>Manager email (optional)</span>
                  <input value={groupManagerEmail} onChange={(e) => setGroupManagerEmail(e.target.value)} placeholder="manager@company.com" disabled={busy || loading} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!token) return;
                    const name = normalize(groupRename);
                    const manager = normalizeEmail(groupManagerEmail);
                    if (!name && !manager) return;
                    setLoading(true);
                    setError("");
                    setNotice("");
                    try {
                      await updateDirectoryGroup({ token, groupId, groupName: name, managerEmail: manager });
                      setNotice("Group updated.");
                      await refreshGroups();
                    } catch (e) {
                      setError(e?.message || "Failed to update group");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={busy || loading}
                >
                  Save
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    if (!token) return;
                    const ok = window.confirm(`Delete group "${selectedGroup?.name || groupId}" from DocSpace?`);
                    if (!ok) return;
                    setLoading(true);
                    setError("");
                    setNotice("");
                    try {
                      await deleteDirectoryGroup({ token, groupId });
                      setNotice("Group deleted.");
                      setManageGroupOpen(false);
                      setGroupId("");
                      setGroupMembers([]);
                      await refreshGroups();
                    } catch (e) {
                      setError(e?.message || "Failed to delete group");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={busy || loading}
                >
                  Delete
                </button>
              </div>

              <hr />

              <label>
                <span>Add members by email</span>
                <textarea value={groupAddEmails} onChange={(e) => setGroupAddEmails(e.target.value)} placeholder="a@company.com, b@company.com" disabled={busy || loading} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!token) return;
                    const emails = normalizeEmailList(groupAddEmails);
                    if (!emails.length) {
                      setError("Enter at least one email");
                      return;
                    }
                    setLoading(true);
                    setError("");
                    setNotice("");
                    try {
                      await updateDirectoryGroup({ token, groupId, addEmails: emails.join(",") });
                      setNotice("Members added.");
                      setGroupAddEmails("");
                      await refreshSelectedGroupMembers(groupId);
                      await refreshGroups();
                    } catch (e) {
                      setError(e?.message || "Failed to add members");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={busy || loading}
                >
                  Add by email
                </button>
              </div>

              <div className="card" style={{ margin: "12px 0 0", padding: 12 }}>
                <div className="recipient-head" style={{ padding: 0, marginBottom: 8 }}>
                  <strong>Add members from list</strong>
                  <span className="muted">{managePickedMemberIds instanceof Set ? managePickedMemberIds.size : 0} selected</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    value={pickerQuery}
                    onChange={(e) => {
                      const q = e.target.value;
                      setPickerQuery(q);
                      refreshPicker({ query: q, offset: 0, append: false }).catch(() => null);
                    }}
                    placeholder="Search people..."
                    disabled={busy || loading || pickerLoading}
                    style={{ maxWidth: 420 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPickerQuery("");
                      refreshPicker({ query: "", offset: 0, append: false }).catch(() => null);
                    }}
                    disabled={busy || loading || pickerLoading}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagePickedMemberIds(new Set())}
                    disabled={busy || loading || pickerLoading || !(managePickedMemberIds instanceof Set ? managePickedMemberIds.size : 0)}
                  >
                    Clear
                  </button>
                </div>
                {pickerError ? <p className="error" style={{ marginTop: 10 }}>{pickerError}</p> : null}
                {pickerLoading ? <EmptyState title="Loading people..." /> : null}
                {!pickerLoading && Array.isArray(pickerPeople) && pickerPeople.length ? (
                  <div className="member-list is-compact" style={{ marginTop: 10 }}>
                    {pickerPeople.map((u) => {
                      const id = String(u?.id || "").trim();
                      if (!id) return null;
                      const email = String(u?.email || "").trim();
                      const name = String(u?.displayName || u?.name || email || "User").trim();
                      const checked = managePickedMemberIds instanceof Set ? managePickedMemberIds.has(id) : false;
                      return (
                        <label key={id} className="check-row" title={email || id}>
                          <input
                            type="checkbox"
                            checked={Boolean(checked)}
                            onChange={(e) => {
                              const next = new Set(managePickedMemberIds instanceof Set ? managePickedMemberIds : []);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              setManagePickedMemberIds(next);
                            }}
                            disabled={busy || loading || pickerLoading}
                          />
                          <span className="truncate">
                            <strong>{name}</strong>
                            {email ? <span className="muted">{" "}- {email}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {!pickerLoading && !pickerQuery && pickerTotal > 0 && Array.isArray(pickerPeople) && pickerPeople.length < pickerTotal ? (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
                    <button type="button" onClick={() => refreshPicker({ query: "", offset: pickerPeople.length, append: true })} disabled={busy || loading || pickerLoading}>
                      Load more
                    </button>
                    <span className="muted">
                      Showing {pickerPeople.length} of {pickerTotal}
                    </span>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      if (!token) return;
                      const ids = Array.from(managePickedMemberIds instanceof Set ? managePickedMemberIds : []);
                      if (!ids.length) return;
                      setLoading(true);
                      setError("");
                      setNotice("");
                      try {
                        await updateDirectoryGroup({ token, groupId, addIds: ids });
                        setNotice("Members added.");
                        setManagePickedMemberIds(new Set());
                        await refreshSelectedGroupMembers(groupId);
                        await refreshGroups();
                      } catch (e) {
                        setError(e?.message || "Failed to add members");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={busy || loading || !(managePickedMemberIds instanceof Set ? managePickedMemberIds.size : 0)}
                  >
                    Add selected ({managePickedMemberIds instanceof Set ? managePickedMemberIds.size : 0})
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>Recipients</h3>
            <p className="muted">Pick people directly, or select a group and pick members.</p>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Select people to build a list for Bulk send.
            </p>
          </div>
          <div className="card-header-actions" style={{ alignItems: "center" }}>
            <span className="muted">{selectedCount} selected</span>
            <button type="button" onClick={clearSelection} disabled={busy || loading || selectedCount === 0}>
              Clear
            </button>
            <button type="button" className="primary" onClick={sendToBulk} disabled={busy || loading || selectedCount === 0} title="Send to Bulk send">
              Bulk send
            </button>
          </div>
        </div>

        <div className="request-filters" style={{ alignItems: "center" }}>
          <Tabs
            value={mode}
            onChange={(v) => {
              setMode(String(v || "people"));
              setPeople([]);
              setPeopleQuery("");
              setPeopleTotal(0);
              setPeopleOffset(0);
              setGroupQuery("");
              setGroupId("");
              setGroupMembers([]);
              setError("");
              setNotice("");
            }}
            items={[
              { id: "people", label: "People" },
              { id: "groups", label: "Groups" }
            ]}
            ariaLabel="Contacts mode"
          />

          {mode === "people" ? (
            <div className="card-header-actions" style={{ padding: "0 16px 12px" }}>
              <input
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Filter or search people..."
                disabled={busy || loading}
                style={{ maxWidth: 420 }}
              />
              <span className="muted">{rows.length} shown</span>
            </div>
          ) : (
            <div className="card-header-actions" style={{ padding: "0 16px 12px" }}>
              <input
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                placeholder="Search groups..."
                disabled={busy || loading}
                style={{ maxWidth: 420 }}
              />
              <span className="muted">{filteredGroups.length} groups</span>
            </div>
          )}
        </div>

        {mode === "people" && !rows.length && !loading ? (
          <EmptyState title="No people found" description="Your DocSpace directory is empty, or this user has no access." />
        ) : null}

        {mode === "groups" && !filteredGroups.length && !loading ? (
          <EmptyState title="No groups found" description="Your DocSpace may hide groups for this user, or there are no groups yet." />
        ) : null}

        {mode === "people" && normalize(peopleQuery) && !rows.length && !loading ? <EmptyState title="No results" description="Try a different search." /> : null}

        {mode === "groups" && filteredGroups.length ? (
          <div className="list">
            {filteredGroups.map((g) => {
              const id = normalize(g?.id);
              if (!id) return null;
              const selected = id === normalize(groupId);
              return (
                <div key={id} className="list-row">
                  <div className="list-main">
                    <span className="truncate">
                      <strong>{normalize(g?.name) || "Group"}</strong>
                      {typeof g?.membersCount === "number" ? <span className="muted">{" "}- {g.membersCount} members</span> : null}
                    </span>
                    {selected ? <span className="muted" style={{ fontSize: 12 }}>Selected</span> : null}
                  </div>
                  <div className="list-actions">
                    <button type="button" className={selected ? "primary" : ""} onClick={() => setGroupId(id)} disabled={busy || loading}>
                      {selected ? "Viewing" : "View members"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupId(id);
                        setManageGroupOpen(true);
                        setManagePickedMemberIds(new Set());
                        setPickerQuery("");
                        refreshPicker({ query: "", offset: 0, append: false }).catch(() => null);
                        refreshSelectedGroupMembers(id).catch(() => null);
                      }}
                      disabled={busy || loading || !canManageDirectory}
                      title="Manage this group"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {mode === "groups" ? (
          <div style={{ padding: "12px 16px 0" }}>
            <div className="recipient-head" style={{ padding: 0, marginBottom: 8 }}>
              <strong>Members{selectedGroup?.name ? ` — ${selectedGroup.name}` : ""}</strong>
              <span className="muted">{normalize(groupId) ? `${rows.length} shown` : "Select a group above"}</span>
            </div>



            {!normalize(groupId) && !loading ? (
              <EmptyState title="Choose a group" description="Select a group to load its members." />
            ) : null}

            {normalize(groupId) && loading ? <EmptyState title="Loading members..." /> : null}

            {normalize(groupId) && !rows.length && !loading ? (
              <EmptyState title="No members found" description="This group has no members available for selection." />
            ) : null}
          </div>
        ) : null}

        {rows.length ? (
          <>
            {shownEmails.length ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "0 16px" }}>
                <span className="muted">{allShownSelected ? "All shown selected" : ""}</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="link" onClick={() => toggleAllShown(true)} disabled={busy || loading || shownEmails.length === 0}>
                    Select all shown
                  </button>
                  {selectedCount ? (
                    <button type="button" className="link" onClick={clearSelection} disabled={busy || loading}>
                      Clear selection
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="list">
              {rows.map((p) => {
                const email = normalizeEmail(p?.email);
                const name = normalize(p?.displayName) || normalize(p?.name) || email || "User";
                const checked = email && pickedEmails instanceof Set ? pickedEmails.has(email) : false;
                return (
                  <div
                    key={email || p?.id || Math.random()}
                    className={`select-row${checked ? " is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleEmail(email, !checked)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      toggleEmail(email, !checked);
                    }}
                    aria-pressed={checked}
                    title={email ? `${name} — ${email}` : name}
                  >
                    <div className="select-row-main">
                      <strong className="truncate">{name}</strong>
                      <span className="muted truncate">{email || "No email"}</span>
                    </div>

                    <div className="list-actions">
                      <span className="select-row-right" aria-hidden="true">
                        {checked ? "✓" : ""}
                      </span>

                      {mode === "people" ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!token) return;
                            const id = String(p?.id || "").trim();
                            if (!id) {
                              setError("User id is missing (cannot delete).");
                              return;
                            }
                            const ok = window.confirm(`Delete ${email || name} from DocSpace?`);
                            if (!ok) return;
                            setLoading(true);
                            setError("");
                            setNotice("");
                            try {
                              await deleteDirectoryPerson({ token, userId: id });
                              setNotice("User deleted.");
                              await refreshPeople({ offset: 0, append: false });
                            } catch (e2) {
                              setError(e2?.message || "Failed to delete user");
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={busy || loading || !canManageDirectory}
                          title="Delete user from DocSpace (admin only)"
                        >
                          Delete
                        </button>
                      ) : null}

                      {mode === "groups" && normalize(groupId) ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!token) return;
                            const memberId = String(p?.id || "").trim();
                            if (!memberId) {
                              setError("Member id is missing (cannot remove).");
                              return;
                            }
                            const ok = window.confirm(`Remove ${email || name} from this group?`);
                            if (!ok) return;
                            setLoading(true);
                            setError("");
                            setNotice("");
                            try {
                              await removeDirectoryGroupMembers({ token, groupId, members: [memberId] });
                              setNotice("Member removed.");
                              await refreshSelectedGroupMembers(groupId);
                              await refreshGroups();
                            } catch (e2) {
                              setError(e2?.message || "Failed to remove member");
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={busy || loading || !canManageDirectory}
                          title="Remove user from group (admin only)"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {mode === "people" && !normalize(peopleQuery) && peopleTotal > 0 && people.length < peopleTotal ? (
          <div style={{ padding: "12px 16px 16px", display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => refreshPeople({ offset: people.length, append: true })}
              disabled={busy || loading}
              title="Load more people"
            >
              Load more
            </button>
            <span className="muted">
              Showing {people.length} of {peopleTotal}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
