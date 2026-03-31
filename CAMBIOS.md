# Historial de Cambios - Test_Servicios IPv6 Pro Tester

## Versión 1.3.3 - 31 de marzo de 2026 (Hotfix: Ping IPv4 en Linux)
**Autor de los cambios:** Enmanuel Cardoza

### 🐛 Bug Crítico Corregido
- **Ping y Traceroute fallaban con 100% packet loss en Linux**
  - **Causa raíz:** El kernel de Linux prefiere IPv6 al resolver dominios con registros AAAA. El VPS tiene interfaces IPv6 asignadas pero sin routing IPv6 saliente hacia Internet. Al hacer `ping google.com`, Linux resolvía a la IP IPv6 de Google y el ping salía sin retorno.
  - **Solución:** Se agregó el flag `-4` al comando `ping` y `traceroute` en Linux para forzar siempre IPv4. Esto garantiza que los diagnósticos sean confiables independientemente de si el VPS tiene IPv6 routing funcional.

### 🔧 Cambios Técnicos
**Archivos Modificados:**
- `ipv6-pro-tester/server/index.js` — Función `buildNetworkCommand`: añadido `-4` para ping y traceroute en Linux.

## Versión 1.3.2 - 29 de marzo de 2026 (Combo Seguridad y Estabilidad)
**Autor de los cambios:** Enmanuel Cardoza

###  Mejoras Implementadas
- **Escudo Rate Limiting** 
  - Implementación de bloqueos de IP para evitar que saturen el servidor (DoS). Los endpoints pesados están bloqueados a un máximo de 20 pruebas por minuto por usuario.
- **Prevención de Procesos Zombi** 
  - Integración de limpieza de memoria (`tree-kill`) para asegurar la muerte absoluta de procesos en segundo plano cuando un visitante abandona el test sin terminar.
- **Transparencia de Proxy Inverso** 
  - Configuración nativa para detectar IPs reales saltando barreras de firewalls o balanceadores como Nginx.
- **Soporte Multiplataforma** 🪟
  - El servidor ahora adapta la sintaxis de red según el host (Linux/Windows) previniendo caídas críticas en producción.

### 🔧 Cambios Técnicos
**Archivos Modificados:**
- `ipv6-pro-tester/server/index.js` - Inyección de middleware de seguridad y limpieza.
- `ipv6-pro-tester/package.json` - Instaladas dependencias `express-rate-limit` y `tree-kill`.

---

## Versión 1.3.0 - 24 de marzo de 2026 (Tercer Update)

### ✨ Mejoras Implementadas
- **Modo Claro Mejorado** 🎨
  - Colores corregidos leyenda de texto oscuro en fondo claro
  - Mejor contraste para legibilidad en ambos modos
  - Variables CSS refinadas para luz

- **Botón Tema Más Discreto** 🌙/☀️
  - Más pequeño y minimalista
  - No ocupa espacio innecesario en el header
  - Ícono flotante con efecto hover sutil
  - Opacidad controlada en reposo

- **Espacio Expandido para IPv6** 📊
  - Sección "Desglose IPv6" dedicada
  - Grid mejorado en layout principal
  - Mejor visualización de direcciones IPv6 largas

- **Desglose Detallado de Chequeo IPv6** 📋
  - Nueva sección "Desglose IPv6" que muestra:
    ✓ Servidor accesible por IPv6
    ✓ Conectividad IPv6 activa  
    ✓ Stack dual-compatible
    ✓ Latencia aceptable
  - Actualización en tiempo real durante pruebas
  - Iconos visuales (✓/✗) para verificaciones
  - Descriptions claras para cada item
  - Se actualiza automáticamente al ejecutar prueba general

### 🔧 Cambios Técnicos
**Archivos Modificados:**
- `public/index.html` - Nueva sección desglose IPv6
- `public/styles.css` - Estilos de tema mejorados + botón discreto
- `public/app.js` - Función updateScores mejorada con desglose

### 📊 Estructura de Verificaciones IPv6
| Chequeo | Puntos | Criterio |
|---------|---------|----------|
| Servidor IPv6 | +4 | Servidor expone dirección IPv6 |
| Conexión IPv6 | +4 | Tu sesión llega por IPv6 |
| Dual Stack | +2 | Servidor soporta ambos protocolos |

**Máximo = 10 puntos cuando:**
1. Servidor tiene IPv6 disponible ✓
2. Tu conexión es IPv6 ✓ 
3. El servidor es dual-stack (IPv4 + IPv6) ✓

### 🚀 Estado Actual (v1.3.0)
- ✅ Servidor operativo en puerto 3000
- ✅ Modo oscuro/claro con mejor contraste
- ✅ Desglose detallado de verificaciones IPv6
- ✅ Interfaz más limpia y espaciosa
- ✅ Botón de tema discreto e intuitivo

### 📧 Historial de Versiones
- **v1.3.2** - Seguridad, Optimización y Soporte Linux (Autor: Enmanuel Cardoza)
- **v1.3.0** - Mejoras UI/UX + Desglose IPv6
- **v1.2.0** - Tema oscuro/claro + Geolocalización + Exportar
- **v1.1.0** - Fix función checkDomain
- **v1.0.0** - Versión inicial

---
**Fecha:** 24-03-2026  
**Estado:** Producción ✅  
**GitHub:** jona thanarellano311/test_servicios_v3
