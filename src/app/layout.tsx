import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsAppAgent - Automatización Inteligente",
  description: "WhatsAppAgent: Plataforma SaaS de automatización de WhatsApp con IA personalizada. Automatiza la atención al cliente con inteligencia artificial.",
  keywords: ["whatsapp", "ia", "chatbot", "automatización", "saas", "inteligencia artificial"],
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
