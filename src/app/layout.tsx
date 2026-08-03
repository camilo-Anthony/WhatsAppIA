import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsAppAgent - Automatización Inteligente",
  description: "Automatiza tu WhatsApp con IA: personaliza su tono, enséñale tu conocimiento y deja que responda, recuerde y actúe por ti.",
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
