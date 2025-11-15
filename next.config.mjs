/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
    optimizePackageImports: ["antd"],
    serverComponentsExternalPackages: ["tiktoken"]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Copy tiktoken .wasm files to standalone output
      config.module.rules.push({
        test: /\.wasm$/,
        type: "asset/resource",
        generator: {
          filename: "static/wasm/[name].[hash][ext]"
        }
      });
    }
    return config;
  }
};

export default nextConfig;
