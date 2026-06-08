# Changelog

## 0.2.0 - 2026-06-08

### Características
- **Memoria Dinámica Inteligente**: Se restringió la extracción automática de hechos en el chat para guardar solo información del cliente, excluyendo la identidad del asistente (Yini) y del creador (Camilo).
- **Control de Tono**: Se añadió soporte en el prompt builder para tonos personalizados del agente sin overrides estáticos.
- **Botón de Limpieza en Playground**: API y frontend integrados para limpiar el historial, mensajes y estado de sandbox de forma completa.
- **Relaciones del Grafo 3D**: Añadida una conexión de tubo blanco cognitiva entre la cámara de Conocimiento y la de Memoria.

### Correcciones
- **Persistencia de Nodos en Grafo 3D**: Se hicieron incondicionales los nodos centrales de Conocimiento, Herramientas y Memoria con sus conexiones, asegurando que el grafo se dibuje correctamente incluso con 0 elementos.
- **Uso de Datos Reales**: Se removió la inyección forzada de datos falsos (`DEMO_GRAPH_DATA`) en el visualizador del Cerebro, permitiendo que renderice el estado real de la base de datos PostgreSQL.
- **Pruebas de Integración**: Corregidos y actualizados los tests de validación del visualizador del Cerebro.
