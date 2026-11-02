import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/chat/:id",
        destination: "/workspaces/:id",
        permanent: true,
      },
      {
        source: "/chat",
        destination: "/workspaces",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
