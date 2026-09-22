import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { getApiBase, getToken, type Material } from "../src/lib/api";
import "./display.css";

type DisplayViewApi = {
  getScreenId: () => number | null;
  onShow: (
    cb: (payload: {
      requestId: string;
      screenId: number;
      materialId?: string;
      combinationId?: string;
      content?: unknown;
      replyChannel: string;
    }) => void
  ) => () => void;
  ackApplied: (payload: {
    replyChannel: string;
    ok: boolean;
    error?: string;
    screenId: number;
  }) => void;
};

declare global {
  interface Window {
    displayViewApi?: DisplayViewApi;
  }
}

function assetUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const base = getApiBase().replace(/\/api\/?$/, "");
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

function DisplayScreen() {
  const screenId = useMemo(() => {
    const fromApi = window.displayViewApi?.getScreenId();
    if (typeof fromApi === "number") return fromApi;
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get("screenId"));
    return Number.isFinite(n) ? n : 0;
  }, []);

  const [material, setMaterial] = useState<Material | null>(null);
  const [message, setMessage] = useState("Standing by");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.displayViewApi;
    if (!api) {
      setMessage("Display view API missing (open via Electron)");
      return;
    }

    return api.onShow((payload) => {
      void (async () => {
        try {
          setError(null);
          if (payload.materialId) {
            const token = getToken();
            const res = await fetch(
              `${getApiBase()}/materials/${payload.materialId}`,
              {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }
            );
            const body = await res.json();
            if (!res.ok || !body.success) {
              throw new Error(body.message || "Failed to load material");
            }
            setMaterial(body.data as Material);
            setMessage(body.data.name);
          } else if (payload.combinationId) {
            setMaterial(null);
            setMessage(`Combination ${payload.combinationId}`);
          } else if (payload.content) {
            setMaterial(null);
            setMessage(JSON.stringify(payload.content));
          } else {
            setMaterial(null);
            setMessage("Empty assignment");
          }

          api.ackApplied({
            replyChannel: payload.replyChannel,
            ok: true,
            screenId: payload.screenId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Apply failed";
          setError(msg);
          api.ackApplied({
            replyChannel: payload.replyChannel,
            ok: false,
            error: msg,
            screenId: payload.screenId,
          });
        }
      })();
    });
  }, []);

  return (
    <div className="display-root">
      <div className="display-chrome">
        <span>Screen {screenId}</span>
        <span>{message}</span>
      </div>
      {error ? <div className="display-error">{error}</div> : null}
      {material?.type === "IMAGE" || material?.type === "EFFECT" ? (
        <img
          className="display-media"
          src={assetUrl(material.assetUrl)}
          alt={material.name}
        />
      ) : null}
      {material?.type === "SOUND" ? (
        <audio
          className="display-audio"
          src={assetUrl(material.assetUrl)}
          autoPlay
          controls
        />
      ) : null}
      {!material ? <div className="display-idle">Awaiting content</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DisplayScreen />
  </StrictMode>
);
