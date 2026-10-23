# SIG-Carreteras PEC v2.0

## Mejoras incluidas
- Catálogo central de KML, KMZ, GeoJSON y JSON, compartido entre usuarios que acceden al mismo servidor.
- Botón GPS y selección manual de punto.
- Búsqueda del tramo lineal más cercano, distancia, atributos y resaltado.
- El servidor guarda los archivos en `catalogo`.

## Actualizar instalación existente
1. Detén el servidor con Ctrl+C. Haz copia de seguridad de `C:\SIG_Carreteras_PEC`.
2. Extrae este ZIP en una carpeta temporal. Copia los archivos del proyecto reemplazando `server.js`, `package.json` y la carpeta `public`. No borres `catalogo` si ya contiene datos.
3. En PowerShell: `cd C:\SIG_Carreteras_PEC`, luego `npm install` y `npm start`.
4. Abre `http://127.0.0.1:3000`. Los demás equipos usan `http://IP-DE-TU-COMPUTADORA:3000`.

## Cargar la red vial
En QGIS: clic derecho sobre la capa vial > Exportar > Guardar objetos como... > GeoJSON. Usa EPSG:4326 (WGS 84). En SIG-Carreteras PEC, selecciona el archivo en “Cargar cartografía”. Después pulsa “Cargar capas compartidas”.

## Limitaciones y precauciones
- No hay autenticación en esta versión. Cualquier usuario con acceso al servidor puede subir o eliminar capas. Usar solo en una red confiable.
- El GPS puede estar bloqueado en navegadores que acceden mediante `http://IP:3000`; `localhost` suele tener permiso por contexto local seguro. Si sucede, hace falta HTTPS en la red local.
- La distancia es una aproximación geométrica, no un sistema de navegación/map matching.
- La jurisdicción solo se sugiere a partir de atributos; no se puede demostrar legalmente solo con coordenadas.
- El mapa base y las librerías CDN requieren internet.
