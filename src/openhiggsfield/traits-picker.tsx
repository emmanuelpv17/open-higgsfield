"use client";

import { useEffect, useState } from "react";

import { listInfluencerOptions } from "@/generation/actions";
import {
  decodeTraits,
  encodeTraits,
  type InfluencerCategory,
  type InfluencerOption,
} from "@/generation/influencer";

import { influencerLabel } from "./influencer-labels";

/* The catalog is the same for every visitor and changes rarely: one read per
   page load is enough. A failed read is forgotten so the next open retries. */
let catalog: Promise<{ ok: true; value: InfluencerCategory[] } | { ok: false; error: string }> | null = null;
function loadCatalog() {
  catalog ??= listInfluencerOptions().then((result) => {
    if (!result.ok) catalog = null;
    return result;
  });
  return catalog;
}

/** AI Influencer's appearance builder: the platform's categories for the
    chosen character type, each capped at its own limit. Anything left empty
    is picked by the platform. */
export function TraitsPicker({
  tier,
  value,
  onChange,
}: {
  tier: string;
  value: unknown;
  onChange: (next: string) => void;
}) {
  const [categories, setCategories] = useState<InfluencerCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadCatalog().then((result) => {
      if (!live) return;
      if (!result.ok) {
        setError(result.error.includes("clave API") ? "Agrega tu clave API para ver las opciones." : result.error);
        return;
      }
      setCategories(result.value);
    });
    return () => {
      live = false;
    };
  }, []);

  const stored = decodeTraits(value);
  const selection = stored && stored.tier === tier ? stored.selection : {};
  const shown = (categories ?? []).filter((category) => category.tiers.includes(tier));
  const picked = Object.values(selection).reduce((sum, picks) => sum + picks.length, 0);

  function toggle(category: InfluencerCategory, option: InfluencerOption) {
    const current = selection[category.key] ?? [];
    let next: string[];
    if (current.includes(option.key)) {
      next = current.filter((key) => key !== option.key);
    } else if (option.exclusive || category.max === 1) {
      next = [option.key];
    } else {
      const byKey = new Map(category.options.map((entry) => [entry.key, entry]));
      next = current.filter((key) => {
        const other = byKey.get(key);
        return other && !other.exclusive && !(option.slot && other.slot === option.slot);
      });
      if (next.length >= category.max) next = next.slice(next.length - category.max + 1);
      next.push(option.key);
    }
    onChange(encodeTraits({ tier, selection: { ...selection, [category.key]: next } }));
  }

  return (
    <div className="ohf-traits">
      <div className="ohf-traits-head">
        <span className="ohf-traits-note">
          {picked ? `${picked} elegido${picked > 1 ? "s" : ""}` : "Nada elegido"} · lo que dejes vacío se elige al azar
        </span>
        {picked > 0 && (
          <button type="button" className="ohf-btn-quiet" onClick={() => onChange("")}>
            Borrar todo
          </button>
        )}
      </div>
      <div className="ohf-traits-list ohf-scroll">
        {error && <p className="ohf-presets-note">{error}</p>}
        {!error && !categories && <p className="ohf-presets-note">Cargando opciones…</p>}
        {shown.map((category) => {
          const picks = selection[category.key] ?? [];
          const options = category.options.filter((option) => !option.tiers || option.tiers.includes(tier));
          return (
            <section key={`${category.key}-${category.tiers.join()}`} className="ohf-traits-group">
              <h4 className="ohf-traits-title">
                {influencerLabel(category.label)}
                {category.max > 1 && <span className="ohf-traits-max">hasta {category.max}</span>}
              </h4>
              <div className="ohf-traits-options" role="group" aria-label={influencerLabel(category.label)}>
                {options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="ohf-traits-option"
                    aria-pressed={picks.includes(option.key)}
                    onClick={() => toggle(category, option)}
                  >
                    {option.color ? (
                      <span className="ohf-traits-swatch" style={{ background: option.color }} aria-hidden />
                    ) : option.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="ohf-traits-thumb"
                        src={option.img}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <span>{influencerLabel(option.label)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
