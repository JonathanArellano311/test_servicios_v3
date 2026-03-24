# Historial de Cambios - Test_Servicios IPv6 Pro Tester

## Versión 1.2.0 - 24 de marzo de 2026 (Segundo Update)

### ✨ Nuevas Funcionalidades
- **Tema Oscuro/Claro** 🌙/☀️
  - Toggle en el header para cambiar entre modo oscuro y claro
  - Preferencia guardada en localStorage
  - Archivo: `public/styles.css` - Variables CSS dinámicas
  - Archivo: `public/app.js` - Funciones `toggleTheme()` y `loadTheme()`

- **Geolocalización** 📍
  - Muestra país, ciudad, ISP y coordenadas
  - Integración con API ipapi.co (gratis sin autenticación)
  - Carga automática al iniciar la aplicación
  - Archivo: `public/app.js` - Función `loadGeolocation()`

- **Exportar Reporte** 📊
  - Descarga datos de pruebas en formato CSV
  - Incluye IP, protocolo, puntuaciones y resultados de pruebas
  - Botón en sección "Resultado técnico"
  - Archivo: `public/app.js` - Función `exportReport()`

- **Diseño Mejorado**
  - Estadísticas ahora ocupan ancho completo (span-full)
  - IPv6 tiene más espacio disponible
  - Nueva sección de geolocalización a ancho completo
  - Grid responsivo optimizado

### 🐛 Correcciones Previas (v1.1.0)
- Función `checkDomain()` corregida en `public/app.js`

### 📦 Archivos Modificados v1.2.0
- `public/index.html` - Agregadas secciones geolocalización y controles de tema
- `public/styles.css` - Variables dinámicas para temas + clase span-full
- `public/app.js` - Nuevas funciones: toggleTheme, loadTheme, loadGeolocation, exportReport

### 🚀 Estado Actual
- Servidor ejecutándose en puerto 3000
- Todos los endpoints activos
- Funcionalidades de UI/UX mejoradas
- Tema dinámico con persistencia
- Geolocalización en vivo
- Exportación de reportes

### 📥 Sincronización
- ✅ Cambios replicados en ambas carpetas
- ✅ Commits registrados en GitHub
- ✅ Base de datos local (/data/results.json) funcional

### 🎨 Mejoras de UX
- Header más compacto con controles
- Layout span-full para secciones principales
- Geolocalización automática
- Exportación de datos en un click

---
**Versión:** 1.2.0  
**Fecha:** 24-03-2026  
**Estado:** Producción
