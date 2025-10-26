/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["antd", "@ant-design/icons"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com"
      }
    ]
  },
  experimental: {
    optimizePackageImports: ["antd"]
  }
};

export default nextConfig;
