import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OATA Care Portal",
    short_name: "OATA Care",
    description: "OATA Maintenance and Cleaning service portal",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3f6",
    theme_color: "#0e7490",
    orientation: "portrait",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
