import { useState } from "react";
import { buildLedLayout } from "./ledLayout";

export default function App() {
  const [text, setText] = useState("abdullah");
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSvg = async () => {
    setLoading(true);

    try {
      await new Promise((resolve) =>
        window.requestAnimationFrame(resolve)
      );

      setLayout(buildLedLayout(text));
    } finally {
      setLoading(false);
    }
  };

  const totalModules =
    layout?.totalModules ?? 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f4",
        padding: 18,
        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <input
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
            placeholder="Enter text"
            style={{
              width: 320,
              height: 40,
              padding: "0 12px",
            }}
          />

          <button
            onClick={generateSvg}
            disabled={loading}
          >
            {loading
              ? "Generating..."
              : "Generate SVG"}
          </button>

          <div
            style={{
              marginLeft: "auto",
            }}
          >
            LEDs: {totalModules}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #111",
            height: 252,
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          <svg
            width={
              layout?.svgWidth ?? 1100
            }
            height={
              layout?.svgHeight ?? 250
            }
            viewBox={`0 0 ${
              layout?.svgWidth ?? 1100
            } ${
              layout?.svgHeight ?? 250
            }`}
          >
            {layout?.layouts?.map(
              (item) => (
                <g
                  key={`${item.index}-${item.letter}`}
                  transform={`translate(${item.x},0)`}
                >
                  <text
                    x={item.width / 2}
                    y={146}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="180"
                    fill="none"
                    stroke="#c7c7c7"
                    strokeWidth="1.15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    shapeRendering="geometricPrecision"
                  >
                    {item.letter}
                  </text>

                  {item.modules.map(
                    (
                      module,
                      moduleIndex
                    ) => (
                      <circle
                        key={`${item.index}-${moduleIndex}`}
                        cx={module.x}
                        cy={module.y}
                        r={module.r}
                        fill="#ffffff"
                        stroke="#a8a8a8"
                        strokeWidth="1"
                      />
                    )
                  )}

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
              )
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
