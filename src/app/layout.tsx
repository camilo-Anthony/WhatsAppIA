import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsAppAgent - Automatización Inteligente",
  description: "Tu WhatsApp con inteligencia artificial. Entiende el contexto, recuerda detalles y ejecuta tareas de forma autónoma 24/7.",
  keywords: ["whatsapp", "ia", "chatbot", "automatización", "inteligencia artificial"],
  verification: {
    google: "hc6sjoumMcnj6eMeJZqKMZWMNfYQhTSJB6t0QThmr9o",
  },
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
