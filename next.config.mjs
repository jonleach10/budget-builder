/** @type {import('next').NextConfig} */
const nextConfig = {
  logging: {
    // Next prints server action arguments in dev, and those can hold row data.
    serverFunctions: false,
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
