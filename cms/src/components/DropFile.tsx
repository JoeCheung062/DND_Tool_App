import { useState, type DragEvent } from "react";

export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesAccept(file: File, accept: string) {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}

export function DropFile({
  accept,
  file,
  onFile,
  onReject,
}: {
  accept?: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onReject: (message: string) => void;
}) {
  const [over, setOver] = useState(false);

  function take(next: File | null) {
    if (!next) {
      onFile(null);
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      onFile(null);
      onReject(`“${next.name}” is ${formatSize(next.size)}. The limit is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    if (accept && !matchesAccept(next, accept)) {
      onFile(null);
      onReject(`“${next.name}” is not an allowed file type for this field.`);
      return;
    }
    onReject("");
    onFile(next);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOver(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    take(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div
      className={over ? "dropzone over" : "dropzone"}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        event.preventDefault();
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOver(false);
      }}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept={accept}
        onChange={(event) => {
          take(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {file ? (
        <>
          <strong>{file.name}</strong>
          <span className="hint">{formatSize(file.size)} · drop another file to replace it</span>
        </>
      ) : (
        <>
          <strong>Drag a file here, or click to browse</strong>
          <span className="hint">Up to {MAX_UPLOAD_MB} MB</span>
        </>
      )}
    </div>
  );
}
