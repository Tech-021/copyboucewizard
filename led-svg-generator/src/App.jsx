import { useEffect, useMemo, useState } from "react";
import { buildLedLayout } from "./ledLayout";
import { textToSvgPath } from "./utils/textToPath";

const DEFAULT_TEXT = "mazisi";
const DEFAULT_FONT_ID = "anton";
const DEFAULT_MODULE_LENGTH_MM = 70;
const DEFAULT_MODULE_WIDTH_MM = 16;
const DEFAULT_EDGE_CLEARANCE_MM = 8;
const DEFAULT_DENSITY = 1.0;

export default function App() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const [moduleLengthMm, setModuleLengthMm] = useState(DEFAULT_MODULE_LENGTH_MM);
  const [moduleWidthMm, setModuleWidthMm] = useState(DEFAULT_MODULE_WIDTH_MM);
  const [edgeClearanceMm, setEdgeClearanceMm] = useState(DEFAULT_EDGE_CLEARANCE_MM);
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canGenerate = useMemo(() => text.trim().length > 0, [text]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void generateLayout(cancelled);
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, density, moduleLengthMm, moduleWidthMm, edgeClearanceMm]);

  async function generateLayout(cancelled = false) {
    if (!canGenerate) {
      setLayout(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const generated = await textToSvgPath(text, DEFAULT_FONT_ID);
      if (!generated || cancelled) {
        if (!generated) setLayout(null);
        return;
      }

      const signWidthMm = clampPhysicalWidthMm(generated.widthUnits, generated.heightUnits);
      const signHeightMm = 1000;
      const glyphLayouts = generated.glyphs.map((glyph) => {
        const glyphWidthMm = Math.max(
          120,
          (signWidthMm * glyph.widthUnits) / Math.max(generated.widthUnits, 1),
        );
        const glyphHeightMm = signHeightMm;
        const glyphResult = buildLedLayout({
          pathData: glyph.pathData,
          viewBox: glyph.viewBox,
          letterWidthMm: glyphWidthMm,
          letterHeightMm: glyphHeightMm,
          moduleLengthMm: Number(moduleLengthMm),
          moduleWidthMm: Number(moduleWidthMm),
          edgeClearanceMm: Number(edgeClearanceMm),
          targetDensity: Number(density),
          mode: "fill",
        });

        return {
          ...glyph,
          layout: glyphResult,
          totalModules: glyphResult.totalModules,
        };
      });

      const totalModules = glyphLayouts.reduce((sum, glyph) => sum + glyph.totalModules, 0);

      if (!cancelled) {
        setLayout({
          viewBox: generated.viewBox,
          widthUnits: generated.widthUnits,
          heightUnits: generated.heightUnits,
          glyphs: glyphLayouts,
          totalModules,
        });
      }
    } catch (err) {
      if (!cancelled) {
        setLayout(null);
        setError(err instanceof Error ? err.message : "Failed to generate layout");
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  const totalModules = layout?.totalModules ?? 0;
  const boardLabel = layout
    ? `${Math.round(layout.widthUnits)} × ${Math.round(layout.heightUnits)}`
    : "0 × 0";

  return (
    <div className="page-shell">
      <div className="page-inner">
        <header className="hero">
          <div>
            <h1>Placement Lab</h1>
            <p>Enter a name or word. The engine turns the glyph outline into rigid LED modules.</p>
          </div>
        </header>

        <section className="panel control-panel">
          <div className="control-grid">
            <div className="field field-wide">
              <label>NAME / WORD</label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder="Type a name or word"
              />
            </div>

            <div className="field">
              <label>DENSITY</label>
              <input
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
                type="range"
                min="0.6"
                max="1.6"
                step="0.05"
              />
            </div>

            <div className="field">
              <label>MODULE LENGTH</label>
              <input
                value={moduleLengthMm}
                onChange={(e) => setModuleLengthMm(Number(e.target.value))}
                type="range"
                min="50"
                max="90"
                step="1"
              />
            </div>

            <div className="field">
              <label>EDGE CLEARANCE</label>
              <input
                value={edgeClearanceMm}
                onChange={(e) => setEdgeClearanceMm(Number(e.target.value))}
                type="range"
                min="2"
                max="20"
                step="1"
              />
            </div>

            <div className="field">
              <label>MODULE WIDTH</label>
              <input
                value={moduleWidthMm}
                onChange={(e) => setModuleWidthMm(Number(e.target.value))}
                type="range"
                min="10"
                max="24"
                step="1"
              />
            </div>
          </div>

          <div className="control-footer">
            <div className="status-pill">{loading ? "Generating..." : "Live update"}</div>
            <button onClick={() => void generateLayout()} disabled={!canGenerate}>
              Generate
            </button>
          </div>

          {error ? <div className="error-box">{error}</div> : null}
        </section>

        <section className="panel preview-panel">
          <div className="preview-shell">
            <svg
              viewBox={layout?.viewBox ?? "0 0 1000 380"}
              preserveAspectRatio="xMidYMid meet"
              className="preview-svg"
            >
              <defs>
                <pattern
                  id="grid"
                  width="56"
                  height="56"
                  patternUnits="userSpaceOnUse"
                  patternTransform="translate(0 0)"
                >
                  <path
                    d="M 56 0 L 0 0 0 56"
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.12)"
                    strokeWidth="1"
                  />
                </pattern>
                <linearGradient id="moduleFill" x1="0" x2="1">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#dbeafe" />
                </linearGradient>
              </defs>

              <rect width="100%" height="100%" fill="url(#grid)" />

              {layout?.glyphs?.map((glyph, glyphIndex) => (
                <g key={`${glyphIndex}-${glyph.char || "glyph"}`} transform={`translate(${glyph.xOffset} ${glyph.yOffset})`}>
                  <path
                    d={glyph.pathData}
                    fill="none"
                    stroke="rgba(226, 232, 240, 0.88)"
                    strokeWidth="8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {glyph.layout?.positions?.map((module, index) => (
                    <g
                      key={index}
                      transform={`translate(${module.x} ${module.y}) rotate(${module.angleDeg})`}
                    >
                      <rect
                        x="-0.55"
                        y="-0.28"
                        width="1.1"
                        height="0.56"
                        rx="0.14"
                        fill="rgba(96, 165, 250, 0.18)"
                      />
                      <rect
                        x={-moduleLengthMm / 2}
                        y={-moduleWidthMm / 2}
                        width={moduleLengthMm}
                        height={moduleWidthMm}
                        rx={moduleWidthMm * 0.18}
                        fill="url(#moduleFill)"
                        stroke="#0f172a"
                        strokeWidth={Math.max(0.6, moduleWidthMm * 0.08)}
                      />
                      <circle cx={-moduleLengthMm * 0.22} cy="0" r={Math.max(0.8, moduleWidthMm * 0.17)} fill="#dc2626" />
                      <circle cx="0" cy="0" r={Math.max(0.8, moduleWidthMm * 0.17)} fill="#dc2626" />
                      <circle cx={moduleLengthMm * 0.22} cy="0" r={Math.max(0.8, moduleWidthMm * 0.17)} fill="#dc2626" />
                    </g>
                  ))}
                </g>
              ))}
            </svg>
          </div>

          <div className="stats-row">
            <span>
              LEDs <strong>{totalModules}</strong>
            </span>
            <span>
              Board <strong>{boardLabel}</strong>
            </span>
            <span>
              Word <strong>{text.trim() || "—"}</strong>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function clampPhysicalWidthMm(widthUnits, heightUnits) {
  const aspect = widthUnits / Math.max(heightUnits, 1);
  return Math.max(220, Math.min(2400, aspect * 1000));
}
