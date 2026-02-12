import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import { createContact, deleteContact, listContacts, updateContact } from "../services/portalApi.js";

function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function parseTags(value) {
  const parts = String(value || "")
    .split(/[,\n]+/g)
    .map((t) => normalize(t))
    .filter(Boolean);
  return Array.from(new Set(parts)).slice(0, 12);
}

export default function Contacts({ session, busy, onOpenBulk }) {
  const token = normalize(session?.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState(() => new Set());

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTags, setEditTags] = useState("");

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await listContacts({ token });
      setItems(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (e) {
      setItems([]);
      setError(e?.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = normalize(query).toLowerCase();
    const list = Array.isArray(items) ? items : [];
    if (!q) return list;
    return list.filter((c) => {
      const hay = `${normalize(c?.name)} ${normalize(c?.email)} ${(Array.isArray(c?.tags) ? c.tags : []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const pickedEmails = useMemo(() => {
    const set = picked instanceof Set ? picked : new Set();
    const out = [];
    for (const c of items) {
      if (!c?.id) continue;
      if (!set.has(String(c.id))) continue;
      const email = normalizeEmail(c.email);
      if (email) out.push(email);
    }
    return Array.from(new Set(out));
  }, [items, picked]);

  const openCreate = () => {
    setEditId("");
    setEditName("");
    setEditEmail("");
    setEditTags("");
    setEditOpen(true);
  };

  const openEdit = (c) => {
    setEditId(normalize(c?.id));
    setEditName(normalize(c?.name));
    setEditEmail(normalizeEmail(c?.email));
    setEditTags(Array.isArray(c?.tags) ? c.tags.join(", ") : "");
    setEditOpen(true);
  };

  const save = async () => {
    if (!token) return;
    const email = normalizeEmail(editEmail);
    if (!email) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (editId) {
        await updateContact({ token, contactId: editId, name: normalize(editName), email, tags: parseTags(editTags) });
        setNotice("Contact updated.");
      } else {
        await createContact({ token, name: normalize(editName), email, tags: parseTags(editTags) });
        setNotice("Contact created.");
      }
      setEditOpen(false);
      await refresh();
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (c) => {
    if (!token) return;
    if (!c?.id) return;
    const ok = typeof window !== "undefined" ? window.confirm(`Delete ${normalize(c?.email) || "this contact"}?`) : true;
    if (!ok) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await deleteContact({ token, contactId: String(c.id) });
      setNotice("Contact deleted.");
      setPicked((prev) => {
        const next = new Set(prev instanceof Set ? prev : []);
        next.delete(String(c.id));
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e?.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const sendToBulk = () => {
    if (!pickedEmails.length) return;
    window.dispatchEvent(new CustomEvent("portal:bulkRecipients", { detail: { emails: pickedEmails } }));
    onOpenBulk?.();
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <h2>Contacts</h2>
          <p className="muted">Save recipients for faster sending.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={refresh} disabled={busy || loading}>
            Refresh
          </button>
          <button type="button" className="primary" onClick={openCreate} disabled={busy || loading}>
            Add contact
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="card">
        <div className="card-header compact">
          <div>
            <h3>Saved recipients</h3>
            <p className="muted">Use these in Bulk send, or copy emails.</p>
          </div>
          <div className="card-header-actions">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." disabled={busy || loading} style={{ maxWidth: 260 }} />
            <span className="muted">{filtered.length} shown</span>
            <button type="button" onClick={sendToBulk} disabled={busy || loading || !pickedEmails.length} title="Send to Bulk send">
              Bulk send ({pickedEmails.length})
            </button>
          </div>
        </div>

        {!filtered.length ? (
          <EmptyState title="No contacts yet" description="Add a contact to reuse recipients across requests." actions={<button type="button" className="primary" onClick={openCreate}>Add contact</button>} />
        ) : (
          <div className="list">
            {filtered.map((c) => {
              const id = normalize(c?.id);
              const selected = id && picked instanceof Set ? picked.has(id) : false;
              const tags = Array.isArray(c?.tags) ? c.tags : [];
              return (
                <div key={id || normalizeEmail(c?.email) || Math.random()} className="list-row">
                  <div className="list-main">
                    <label className="muted" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        onChange={(e) => {
                          const on = Boolean(e.target.checked);
                          setPicked((prev) => {
                            const next = new Set(prev instanceof Set ? prev : []);
                            if (on && id) next.add(id);
                            if (!on && id) next.delete(id);
                            return next;
                          });
                        }}
                        disabled={busy || loading || !id}
                      />
                      <span className="truncate">
                        <strong>{normalize(c?.name) || normalizeEmail(c?.email) || "Contact"}</strong>
                        <span className="muted">{" "}- {normalizeEmail(c?.email) || "-"}</span>
                      </span>
                    </label>
                    {tags.length ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        Tags: {tags.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="list-actions">
                    <button type="button" onClick={() => openEdit(c)} disabled={busy || loading}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(c)} disabled={busy || loading}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={editOpen}
        title={editId ? "Edit contact" : "Add contact"}
        onClose={() => {
          if (loading) return;
          setEditOpen(false);
        }}
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} disabled={busy || loading}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={save} disabled={busy || loading || !normalizeEmail(editEmail)}>
              {loading ? "Working..." : "Save"}
            </button>
          </>
        }
      >
        <form className="auth-form" onSubmit={(e) => e.preventDefault()} style={{ marginTop: 0 }}>
          <label>
            <span>Name</span>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busy || loading} placeholder="e.g. John Smith" />
          </label>
          <label>
            <span>Email</span>
            <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={busy || loading} placeholder="name@company.com" />
          </label>
          <label>
            <span>Tags (optional)</span>
            <input value={editTags} onChange={(e) => setEditTags(e.target.value)} disabled={busy || loading} placeholder="e.g. HR, Finance" />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Tip: select contacts, then click Bulk send.
          </p>
        </form>
      </Modal>
    </div>
  );
}

