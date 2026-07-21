import { ImageResponse } from "next/og";

export const alt = "Padel Turni - Fair draws. Better games.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: 74,
        background: "#102f27",
        color: "white",
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          borderRadius: 999,
          right: -100,
          top: -170,
          background: "#207a5b",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 310,
          height: 310,
          borderRadius: 999,
          right: 80,
          bottom: -180,
          background: "#b8ed61",
          opacity: 0.18,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 92,
              height: 92,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 27,
              background: "#b8ed61",
            }}
          >
            <div
              style={{
                width: 40,
                height: 64,
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
                transform: "rotate(-28deg)",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 48,
                  display: "flex",
                  borderRadius: 999,
                  background: "#102f27",
                }}
              />
              <div
                style={{
                  width: 10,
                  height: 20,
                  display: "flex",
                  marginTop: -3,
                  borderRadius: 4,
                  background: "#102f27",
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2 }}>
            Padel Turni
          </div>
        </div>
        <div
          style={{
            marginTop: 80,
            maxWidth: 830,
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            lineHeight: 1.02,
            fontWeight: 800,
            letterSpacing: -4,
          }}
        >
          <div>Fair draws.</div>
          <div>Better games.</div>
        </div>
        <div style={{ marginTop: 34, fontSize: 26, color: "#c8d7d0" }}>
          Plan events, run live matches, and track every result.
        </div>
      </div>
    </div>,
    size,
  );
}
