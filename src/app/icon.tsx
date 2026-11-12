import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // Brand mark: two cobalt rails on white (the header and footer mark, drawn large).
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, padding: 3, background: "#ffffff", borderRadius: 4 }}>
        <div style={{ display: "flex", height: 8, background: "#1546c9" }} />
        <div style={{ display: "flex", height: 8, background: "#1546c9" }} />
      </div>
    ),
    { ...size },
  );
}
