import { ImageResponse } from "next/og";
import { APP_ICON, markDataUri } from "@/lib/brand/mark";

/** Apple touch icon (180 × 180), same mark as the in-app logo (lib/brand/mark.ts). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
       
      <img src={markDataUri(APP_ICON)} width={size.width} height={size.height} alt="" />
    ),
    size
  );
}
