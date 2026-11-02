import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Klecx — AI Workspace";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d0f17",
          color: "#f3f4f6",
          fontFamily: "sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.25) 0%, transparent 65%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "36px",
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              display: "flex",
              alignItems: "center",
              color: "#ffffff",
            }}
          >
            <span>Kl</span>
            <svg
              width="86"
              height="86"
              viewBox="0 0 100 100"
              fill="none"
              style={{ margin: "0 6px" }}
            >
              <path
                d="M 75 36 H 37 V 63.5 H 91.75 V 8.25 H 8.25 V 91.75 H 91.75"
                stroke="#8b5cf6"
                strokeWidth="16.5"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
            <span>cx</span>
          </div>
        </div>

        <div
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          Workspaces, not threads.
        </div>

        <div
          style={{
            fontSize: 22,
            color: "#9ca3af",
            textAlign: "center",
            maxWidth: 850,
            lineHeight: 1.4,
          }}
        >
          Organize AI research into projects, preserve response versions, and reason over passages with zero lost context.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "40px",
            padding: "8px 20px",
            borderRadius: "9999px",
            backgroundColor: "rgba(124, 58, 237, 0.15)",
            border: "1px solid rgba(124, 58, 237, 0.35)",
            color: "#a78bfa",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          <span>Multi-turn reasoning</span>
          <span>·</span>
          <span>Version history</span>
          <span>·</span>
          <span>100% Private</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
