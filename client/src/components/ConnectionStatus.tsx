import type { ConnStatus } from "../types";

const LABEL: Record<ConnStatus, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

export default function ConnectionStatus({ status, reason, onRetry }: { status: ConnStatus; reason: string | null; onRetry: () => void }) {
  const serverKick = reason === "io server disconnect";
  return (
    <div className={`status status-${status}`} role="status" aria-live="polite">
      <span className="dot" />
      {LABEL[status]}
      {status !== "connected" && reason && (
        <span className="muted small"> ({serverKick ? "closed by server" : reason})</span>
      )}
      {status === "disconnected" && <button className="link" onClick={onRetry}>Retry</button>}
    </div>
  );
}
