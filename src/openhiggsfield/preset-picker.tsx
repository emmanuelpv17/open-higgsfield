"use client";

import { useEffect, useState } from "react";

import { listPresets } from "@/generation/actions";
import type { PresetSource } from "@/generation/catalog";
import { encodePreset, presetId, type MarketingPreset } from "@/generation/presets";

/* The platform's own preset groups, named the way its console names them. */
const TYPE_LABELS: Record<string, string> = {
  ads: "Anuncios gráficos",
  product: "Fotos de producto",
  "product-shots": "Fotos de producto",
  marketplace: "Diseño para marketplace",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1).replace(/[-_]/g, " ") : "Otros");
}

/** A model's presets, read live with the visitor's own key. For Marketing
    Studio, picking one switches to preset mode and "No preset" returns to
    direct mode; Genjutsu Restyle requires a style. */
export function PresetPicker({
  source,
  value,
  onChange,
}: {
  source: PresetSource;
  value: unknown;
  onChange: (next: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MarketingPreset[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [type, setType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selected = presetId(value);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void listPresets({ source, search }).then((result) => {
        if (!live) return;
        setLoading(false);
        if (!result.ok) {
          setError(result.error.includes("clave API") ? "Agrega tu clave API para ver los estilos." : result.error);
          return;
        }
        setError(null);
        setItems(result.value.items);
        setCursor(result.value.cursor);
      });
    }, search ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, source]);

  async function loadMore() {
    if (cursor === null) return;
    setLoading(true);
    const result = await listPresets({ source, search, cursor });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setItems((prev) => [...prev, ...result.value.items.filter((row) => !prev.some((p) => p.id === row.id))]);
    setCursor(result.value.cursor);
  }

  const types = [...new Set(items.map((item) => item.type))].filter(Boolean);
  const shown = type ? items.filter((item) => item.type === type) : items;

  return (
    <div className="ohf-presets">
      <input
        className="ohf-presets-search"
        value={search}
        placeholder="Buscar estilos"
        aria-label="Buscar estilos"
        onChange={(event) => setSearch(event.target.value)}
      />
      {types.length > 1 && (
        <div className="ohf-presets-types" role="group" aria-label="Grupos de estilos">
          {["", ...types].map((option) => (
            <button
              key={option || "all"}
              type="button"
              className="ohf-presets-type"
              aria-pressed={type === option}
              onClick={() => setType(option)}
            >
              {option ? typeLabel(option) : "Todos"}
            </button>
          ))}
        </div>
      )}
      <div className="ohf-opts ohf-scroll ohf-presets-list" role="group">
        {source === "marketing-studio" && (
          <button
            type="button"
            className="ohf-opt"
            aria-pressed={!selected}
            onClick={() => onChange("")}
          >
            <span className="ohf-opt-label">Sin estilo — editar o generar libremente</span>
          </button>
        )}
        {shown.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="ohf-opt"
            aria-pressed={preset.id === selected}
            onClick={() => onChange(encodePreset(preset))}
          >
            <span className="ohf-opt-label">{preset.name}</span>
            {preset.type && <span className="ohf-presets-tag">{typeLabel(preset.type)}</span>}
          </button>
        ))}
        {error && <p className="ohf-presets-note">{error}</p>}
        {!error && loading && <p className="ohf-presets-note">Cargando estilos…</p>}
        {!error && !loading && items.length === 0 && <p className="ohf-presets-note">Ningún estilo coincide.</p>}
        {!error && !loading && cursor !== null && (
          <button type="button" className="ohf-opt ohf-presets-more" onClick={() => void loadMore()}>
            Ver más
          </button>
        )}
      </div>
      {selected && source === "marketing-studio" && (
        <p className="ohf-presets-note">Adjunta primero la foto del producto; una foto de modelo como segunda es opcional.</p>
      )}
    </div>
  );
}
