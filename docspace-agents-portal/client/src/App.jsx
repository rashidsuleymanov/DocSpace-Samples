import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import DemoStart from "./pages/DemoStart.jsx";
import StudioLogin from "./pages/StudioLogin.jsx";
import StudioAgents from "./pages/StudioAgents.jsx";
import StudioAgentEditor from "./pages/StudioAgentEditor.jsx";
import StudioTemplates from "./pages/StudioTemplates.jsx";
import WidgetChat from "./pages/WidgetChat.jsx";
import { useSession } from "./services/session.js";
import StudioLayout from "./components/StudioLayout.jsx";

function RequireStudio({ children }) {
  const { isAuthed, loading, demoEnabled } = useSession();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthed) {
    return <Navigate to={demoEnabled ? "/demo" : "/studio/login"} replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/studio" replace />} />
        <Route path="/demo" element={<DemoStart />} />
        <Route path="/studio/login" element={<StudioLogin />} />
        <Route
          path="/studio"
          element={
            <RequireStudio>
              <StudioLayout />
            </RequireStudio>
          }
        >
          <Route index element={<StudioAgents />} />
          <Route path="templates" element={<StudioTemplates />} />
          <Route path="agents/:id" element={<StudioAgentEditor />} />
        </Route>
        <Route path="/w/:publicId" element={<WidgetChat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
