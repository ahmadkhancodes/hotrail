import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // Brand mark: two cobalt rails on white (the header and footer mark, drawn large).
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 48, padding: 20, background: "#ffffff", borderRadius: 0 }}>
        <div style={{ display: "flex", height: 48, background: "#1546c9" }} />
        <div style={{ display: "flex", height: 48, background: "#1546c9" }} />
      </div>
    ),
    { ...size },
  );
}
