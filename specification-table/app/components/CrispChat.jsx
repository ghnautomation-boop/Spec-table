import { useEffect } from "react";

/**
 * Componentă pentru integrarea Crisp Chat în aplicația embedded
 * Crisp Website ID trebuie să fie setat în variabilele de environment ca VITE_CRISP_WEBSITE_ID
 */
export default function CrispChat() {
  useEffect(() => {
    // Obține Crisp Website ID din environment variables (Vite folosește import.meta.env)
    // Website ID: 1b6cfb9f-90e1-435a-ae68-081cb70a9b3c
    const crispWebsiteId = import.meta.env.VITE_CRISP_WEBSITE_ID || "1b6cfb9f-90e1-435a-ae68-081cb70a9b3c";
    
    if (!crispWebsiteId) {
      console.warn("[CrispChat] CRISP_WEBSITE_ID not configured. Chat will not be available.");
      return;
    }

    // Verifică dacă script-ul Crisp a fost deja încărcat
    if (window.$crisp) {
      return;
    }

    // Creează și adaugă script-ul Crisp
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = crispWebsiteId;
    
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);

    // Cleanup: nu ștergem script-ul la unmount pentru că vrem să rămână activ
    return () => {
      // Script-ul rămâne încărcat pentru a menține chat-ul activ
    };
  }, []);

  return null; // Componenta nu renderizează nimic vizual, doar încarcă script-ul
}

