import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const alt = `${product.fullName}: ${product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Departure board card (docs/design-brief.md §4): cobalt band, bright white field, one huge numeral as the anchor.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", color: "#0a1633", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1546c9", color: "#ffffff", padding: "24px 80px", fontSize: 28 }}>
          <div style={{ display: "flex", fontWeight: 600 }}>{product.fullName}</div>
          <div style={{ display: "flex" }}>{product.host}</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "space-between", padding: "0 80px 72px", gap: 48 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.1, letterSpacing: -2, maxWidth: 640 }}>{product.tagline}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 220, fontWeight: 500, lineHeight: 0.85, letterSpacing: -10, color: "#1546c9" }}>25%</div>
            <div style={{ display: "flex", fontSize: 24, color: "#525d72", marginTop: 16 }}>Example rollout</div>
          </div>
        </div>
        <div style={{ display: "flex", height: 8, background: "#1546c9" }} />
      </div>
    ),
    { ...size },
  );
}
