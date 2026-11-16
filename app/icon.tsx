import { ImageResponse } from "next/og";
import { APP_ICON, markDataUri } from "@/lib/brand/mark";

/** Browser tab and PWA icons, drawn from the same mark as the in-app logo (lib/brand/mark.ts). */
const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id) || 32;
  return new ImageResponse(
    (
       
      <img src={markDataUri(APP_ICON)} width={px} height={px} alt="" />
    ),
    { width: px, height: px }
  );
}
