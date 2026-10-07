"use client";

import { useEffect, useRef, useState } from "react";

import {
  createSoulCharacter,
  deleteSoulCharacter,
  listSoulCharacters,
  type SoulCharacter,
} from "@/generation/actions";
import { encodePreset, presetId } from "@/generation/presets";
import { uploadMedia } from "@/generation/upload";

const STATUS_LABELS: Record<string, string> = {
  not_ready: "En espera",
  queued: "En cola",
  in_progress: "Entrenando",
  completed: "Listo",
  failed: "Falló",
};
const SETTLED = new Set(["completed", "failed"]);

/** The visitor's Soul ID characters for one Soul version, and the form that
    trains a new one from photos of the same person. Training is billed by the
    platform and takes a while; the list refreshes itself until it settles. */
export function SoulIdPicker({
  version,
  value,
  onChange,
}: {
  version: "v1" | "v2" | "cinema";
  value: unknown;
  onChange: (next: string) => void;
}) {
  const [items, setItems] = useState<SoulCharacter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = presetId(value);

  async function refresh() {
    const result = await listSoulCharacters(version);
    if (!result.ok) {
      setError(result.error.includes("clave API") ? "Agrega tu clave API para ver tus personajes." : result.error);
      return;
    }
    setError(null);
    setItems(result.value);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const training = items?.some((item) => !SETTLED.has(item.status)) ?? false;
  useEffect(() => {
    if (!training) return;
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training, version]);

  async function create() {
    if (!name.trim() || !files.length) return;
    setError(null);
    try {
      const urls: string[] = [];
      for (const [index, file] of files.entries()) {
        setBusy(`Subiendo foto ${index + 1} de ${files.length}…`);
        urls.push((await uploadMedia(file)).url);
      }
      setBusy("Iniciando entrenamiento…");
      const result = await createSoulCharacter({ name, version, urls });
      if (!result.ok) throw new Error(result.error);
      setItems((prev) => [result.value, ...(prev ?? [])]);
      setCreating(false);
      setName("");
      setFiles([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: SoulCharacter) {
    if (!window.confirm(`¿Eliminar “${item.name}”? No se puede deshacer.`)) return;
    const result = await deleteSoulCharacter(item.id);
    if (!result.ok) return setError(result.error);
    if (item.id === selected) onChange("");
    setItems((prev) => prev?.filter((entry) => entry.id !== item.id) ?? null);
  }

  if (creating) {
    return (
      <div className="ohf-presets ohf-soulid">
        <input
          className="ohf-presets-search"
          value={name}
          maxLength={100}
          placeholder="Nombre del personaje"
          aria-label="Nombre del personaje"
          onChange={(event) => setName(event.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 100))}
        />
        <button type="button" className="ohf-opt" onClick={() => fileRef.current?.click()}>
          <span className="ohf-opt-label">
            {files.length ? `${files.length} foto${files.length > 1 ? "s" : ""} elegida${files.length > 1 ? "s" : ""} — cambiar` : "Elegir fotos"}
          </span>
        </button>
        <p className="ohf-presets-note">
          Usa 10–20 fotos claras de la misma persona: distintos ángulos, expresiones y luz. Higgsfield cobra
          unos $2.50 por entrenarlo y tarda unos minutos.
        </p>
        {error && <p className="ohf-presets-note ohf-soulid-error">{error}</p>}
        {busy && <p className="ohf-presets-note">{busy}</p>}
        <div className="ohf-soulid-actions">
          <button type="button" className="ohf-btn-quiet" disabled={busy !== null} onClick={() => setCreating(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="ohf-keys-save"
            disabled={busy !== null || !name.trim() || !files.length}
            onClick={() => void create()}
          >
            Entrenar ≈ $2.50
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ohf-presets ohf-soulid">
      <div className="ohf-opts ohf-scroll ohf-presets-list" role="group">
        <button type="button" className="ohf-opt" aria-pressed={!selected} onClick={() => onChange("")}>
          <span className="ohf-opt-label">Sin Soul ID</span>
        </button>
        {(items ?? []).map((item) => {
          const ready = item.status === "completed";
          return (
            <div key={item.id} className="ohf-soulid-row">
              <button
                type="button"
                className="ohf-opt"
                aria-pressed={item.id === selected}
                disabled={!ready}
                onClick={() => onChange(encodePreset({ id: item.id, name: item.name, type: "" }))}
              >
                {item.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ohf-soulid-thumb" src={item.thumbnail} alt="" />
                )}
                <span className="ohf-opt-label">{item.name}</span>
                {!ready && <span className="ohf-presets-tag">{STATUS_LABELS[item.status] ?? item.status}</span>}
              </button>
              <button
                type="button"
                className="ohf-soulid-delete"
                aria-label={`Eliminar ${item.name}`}
                title="Eliminar"
                onClick={() => void remove(item)}
              >
                ×
              </button>
            </div>
          );
        })}
        {error && <p className="ohf-presets-note">{error}</p>}
        {!error && !items && <p className="ohf-presets-note">Cargando tus personajes…</p>}
        {!error && items?.length === 0 && (
          <p className="ohf-presets-note">Todavía no tienes personajes. Entrena uno con fotos de una persona.</p>
        )}
        {training && <p className="ohf-presets-note">Entrenando — esta lista se actualiza sola.</p>}
      </div>
      <button type="button" className="ohf-opt ohf-presets-more" onClick={() => setCreating(true)}>
        + Nuevo personaje
      </button>
    </div>
  );
}
