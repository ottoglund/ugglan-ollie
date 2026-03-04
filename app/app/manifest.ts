import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ugglan Ollie",
    short_name: "Ollie",
    description: "En klok liten uggla som hjälper barn att förstå sina känslor.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      }
    ],
  };
}