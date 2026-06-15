import { useState } from "react";
import { buildLedLayout } from "./ledLayout";

export default function App() {
  const [text, setText] = useState("abdullah");
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSvg = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      setLayout(buildLedLayout(text));
    } finally {
      setLoading(false);
    }
  };

  const totalModules = layout?.totalModules ?? 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f4",
        padding: "18px",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text"
            style={{
              width: "320px",
              height: "40px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #cfcfcf",
              background: "#fff",
              fontSize: "16px",
              outline: "none",
            }}
          />

          <button
            onClick={generateSvg}
            disabled={loading}
            style={{
              height: "40px",
              padding: "0 18px",
              borderRadius: "8px",
              border: "1px solid #bdbdbd",
              background: loading ? "#ececec" : "#ffffff",
              cursor: loading ? "wait" : "pointer",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            {loading ? "Generating..." : "Generate SVG"}
          </button>

          <div style={{ marginLeft: "auto", fontSize: "14px", color: "#666" }}>
            Modules: {totalModules}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #111",
            height: "252px",
            overflowX: "auto",
            overflowY: "hidden",
            boxShadow: "0 0 0 1px #1f1f1f inset",
          }}
        >
          <svg
            width={layout?.svgWidth ?? 1100}
            height={layout?.svgHeight ?? 350}
            viewBox={`0 0 ${layout?.svgWidth ?? 1100} ${layout?.svgHeight ?? 350}`}
            role="img"
            aria-label="LED glyph preview"
          >
            {layout?.layouts?.map((item) => (
              <g key={`${item.index}-${item.letter}`} transform={`translate(${item.x}, 0)`}>
                <text
                  x={item.width / 2}
                  y={146}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="180"
                  fontWeight="400"
                  fill="none"
                  stroke="#c9c9c9"
                  strokeWidth="1.4"
                >
                  {item.letter}
                </text>

                {item.modules.map((module, moduleIndex) => (
                  <g
                    key={`${item.index}-${moduleIndex}`}
                    transform={`translate(${module.x + module.width / 2}, ${module.y + module.height / 2})`}
                  >
                    <rect
                      x={-module.width / 2}
                      y={-module.height / 2}
                      width={module.width}
                      height={module.height}
                      rx="2"
                      ry="2"
                      fill="#fff"
                      stroke="#8f8f8f"
                      strokeWidth="1"
                    />
                    <circle cx={-3.6} cy="0" r="1" fill="#8f8f8f" />
                    <circle cx="0" cy="0" r="1" fill="#8f8f8f" />
                    <circle cx="3.6" cy="0" r="1" fill="#8f8f8f" />
                  </g>
                ))}

                <text
                  x={item.width / 2}
                  y={232}
                  textAnchor="middle"
                  fontSize="16"
                  fill="#111"
                >
                  {item.count}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
