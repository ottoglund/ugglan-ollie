"use client";

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // tyst: vi vill inte störa användaren om SW inte går att regga i vissa lägen
      }
    };

    register();
  }, []);

  return null;
}