/** Formats milliseconds as "M:SS" or "H:MM:SS" once past an hour. */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
