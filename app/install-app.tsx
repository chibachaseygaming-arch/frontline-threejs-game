"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => setPrompt(null);
    addEventListener("beforeinstallprompt", ready);
    addEventListener("appinstalled", installed);
    return () => { removeEventListener("beforeinstallprompt", ready); removeEventListener("appinstalled", installed); };
  }, []);
  if (!prompt) return null;
  return <button className="install-app" onClick={async()=>{await prompt.prompt();await prompt.userChoice;setPrompt(null)}}>INSTALL APP</button>;
}
