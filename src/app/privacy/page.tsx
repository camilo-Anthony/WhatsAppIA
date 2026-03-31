import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad - WhatsAppAgent",
  description: "Política de privacidad de WhatsAppAgent. Conoce cómo recopilamos, usamos y protegemos tu información.",
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{
      maxWidth: "800px",
      margin: "0 auto",
      padding: "40px 20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: "#e0e0e0",
      backgroundColor: "#0a0a0a",
      minHeight: "100vh",
      lineHeight: 1.7,
    }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "8px", color: "#fff" }}>
        Política de Privacidad
      </h1>
      <p style={{ color: "#888", marginBottom: "32px" }}>
        Última actualización: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>1. Información que recopilamos</h2>
        <p>
          WhatsAppAgent recopila la siguiente información cuando utilizas nuestro servicio:
        </p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li>Información de tu cuenta (nombre, correo electrónico) proporcionada durante el registro.</li>
          <li>Datos de conexión de WhatsApp necesarios para el funcionamiento del bot.</li>
          <li>Mensajes procesados por el sistema de IA para generar respuestas automatizadas.</li>
          <li>Información de integraciones de terceros (Google Calendar, Google Sheets) cuando las activas voluntariamente.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>2. Uso de la información</h2>
        <p>Utilizamos tu información para:</p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li>Proveer y mantener el servicio de automatización de WhatsApp.</li>
          <li>Procesar mensajes a través de inteligencia artificial para generar respuestas.</li>
          <li>Conectar con servicios de terceros que autorices (Google Calendar, Sheets, etc.).</li>
          <li>Mejorar y optimizar el funcionamiento de la plataforma.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>3. Integraciones con Google</h2>
        <p>
          Cuando conectas servicios de Google (Calendar, Sheets, Drive), solicitamos acceso únicamente a los
          permisos necesarios para la funcionalidad específica. Los tokens de acceso se almacenan de forma
          segura y encriptada. Puedes revocar el acceso en cualquier momento desde la configuración de tu cuenta
          o desde{" "}
          <a href="https://myaccount.google.com/permissions" style={{ color: "#60a5fa" }} target="_blank" rel="noopener noreferrer">
            tu cuenta de Google
          </a>.
        </p>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>4. Almacenamiento y seguridad</h2>
        <p>
          Tu información se almacena en servidores seguros. Implementamos medidas de seguridad técnicas y
          organizativas para proteger tus datos contra acceso no autorizado, alteración o destrucción.
        </p>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>5. Compartir información</h2>
        <p>
          No vendemos ni compartimos tu información personal con terceros, excepto cuando sea necesario para:
        </p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li>Proveer el servicio (procesamiento de IA a través de proveedores como Groq).</li>
          <li>Cumplir con obligaciones legales.</li>
          <li>Proteger nuestros derechos y seguridad.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>6. Tus derechos</h2>
        <p>Tienes derecho a:</p>
        <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li>Acceder a tus datos personales.</li>
          <li>Solicitar la corrección o eliminación de tus datos.</li>
          <li>Revocar el acceso a integraciones de terceros en cualquier momento.</li>
          <li>Eliminar tu cuenta y todos los datos asociados.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "1.3rem", color: "#fff", marginBottom: "12px" }}>7. Contacto</h2>
        <p>
          Si tienes preguntas sobre esta política de privacidad, puedes contactarnos a través de la plataforma.
        </p>
      </section>

      <div style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #333", textAlign: "center" }}>
        <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>← Volver al inicio</a>
      </div>
    </main>
  );
}
