# ATLAS · Demo de Gestión de Compras e Importaciones

Versión `0.16.108-demo`. [Abrir demo](https://demo.naraconsultores.com/demo-app-importaciones-cp/).

Muestra publicada autorizada de18 expedientes de Airtable y los mismos dos ejemplos simulados de Compras de la demo local. Fechas y metas del corte de19/10/2026; Catálogos operativos completos y correos empresariales autorizados DEC-216. La carga es una copia estática y no sincroniza Airtable. Incluye todos los registros del maestro JDE y referencias cruzadas como datos; excluye archivos originales y plantillas históricas retiradas. Las capturas y los adjuntos se recuperan al recargar desde el mismo navegador. Cada navegador tiene su propio espacio de demo. JDE, Getpay, correo y documentos se simulan; esta demo no conecta con sistemas operativos. Su publicación no constituye aceptación funcional del cliente.

La opción Restablecer demo está en Administración, dentro de Parámetros y documentos.

Expedientes permite combinar filtros de ID de expediente, Factura, OP y OI.

ATLAS web abre los mismos casos de prueba desde cualquier equipo.

Expedientes abre con los datos compartidos mientras se completa el maestro de artículos.

El detalle de artículos coteja automáticamente las coincidencias autorizadas del expediente compartido.

La navegación se mantiene disponible mientras se preparan las vistas y el maestro JDE.

Compras toma los atributos del maestro JDE y muestra las diferencias válidas de precio como aviso.

La validación de traducción usa el mismo resultado de cotejo que el detalle de artículos.

La traducción usa los pedidos versionados y autorizados de Supabase y confirma saldo y vigencia al enviar.

El cotejo automático consulta el corte de pedidos JDE habilitado para todos los expedientes del espacio compartido.
