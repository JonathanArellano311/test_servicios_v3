# Test_Servicios

Herramienta web para validar IPv4, IPv6, latencia, jitter, pérdida estimada, paquetes grandes, prueba local de velocidad y registros DNS A/AAAA.

## Abrir en VS Code

1. Abre la carpeta `ipv6-pro-tester` en VS Code.
2. En la terminal usa:
   - `npm.cmd install`
   - `npm.cmd run dev`
3. Abre `http://localhost:3000`

## Funciones incluidas

- Puntuación IPv4 e IPv6
- Estado general de conectividad
- Detección de IP observada por el servidor
- Test de paquetes configurable
- Modo continuo para solicitudes HTTP
- Medición de latencia y jitter
- Prueba de payload grande
- Speed test local + enlaces a Speedtest y Fast
- Verificador de dominio con registros A y AAAA

## Nota importante

El test de paquetes se basa en solicitudes HTTP/HTTPS al backend. No sustituye un ping ICMP del sistema operativo, pero es útil para una estimación web de latencia, jitter y pérdida.
