import React, { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ChatWidget from "../components/ChatWidget.jsx";

export default function WidgetChat() {
  const { publicId } = useParams();
  const [params] = useSearchParams();
  const embedKey = params.get("k") || "";
  const canChat = useMemo(() => Boolean(publicId && embedKey), [publicId, embedKey]);

  return (
    <div className="container" style={{ width: "min(760px, 94vw)" }}>
      {canChat ? (
        <ChatWidget publicId={publicId} embedKey={embedKey} height={"min(70vh, 760px)"} />
      ) : (
        <div className="card">
          <div className="card-pad">
            <div className="title">Chat</div>
            <div className="muted">Missing embed key.</div>
          </div>
        </div>
      )}
    </div>
  );
}

