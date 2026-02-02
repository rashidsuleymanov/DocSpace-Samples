import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";

export default function Settings({ session, onLogout, onNavigate, onSave }) {
  const [form, setForm] = useState({
    fullName: session.user.fullName || "",
    email: session.user.email || "",
    phone: session.user.phone || "",
    sex: session.user.sex || "",
    location: session.user.location || "",
    title: session.user.title || "",
    comment: session.user.comment || ""
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      fullName: session.user.fullName || "",
      email: session.user.email || "",
      phone: session.user.phone || "",
      sex: session.user.sex || "",
      location: session.user.location || "",
      title: session.user.title || "",
      comment: session.user.comment || ""
    });
  }, [
    session.user.fullName,
    session.user.email,
    session.user.phone,
    session.user.sex,
    session.user.location,
    session.user.title,
    session.user.comment
  ]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const updated = await onSave(form);
      const name = updated?.user?.fullName || form.fullName;
      const phone = updated?.user?.phone || form.phone || "-";
      setMessage(
        `Saved. Sent: ${form.fullName || "-"}, ${form.phone || "-"} | DocSpace returned: ${name}, ${phone}`
      );
    } catch (error) {
      setMessage(error?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar user={session.user} onLogout={onLogout} active="settings" onNavigate={onNavigate} />
      <main>
        <Topbar room={session.room || { name: "Profile settings" }} />
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Profile settings</h3>
              <p className="muted">Update your personal data stored in DocSpace.</p>
            </div>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label>
              Full name
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Sex
              <select
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value })}
              >
                <option value="">Not set</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </label>
            <label>
              Location
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Comment
              <textarea
                rows="3"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </label>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>
          {message && <p className="muted">{message}</p>}
        </section>
      </main>
    </div>
  );
}
