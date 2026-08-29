import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "unpdf", "defuddle", "linkedom"],
  agentRules: false,
};

export default withAui(nextConfig);
