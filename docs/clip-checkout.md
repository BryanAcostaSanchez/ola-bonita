# Clip: configuración segura de cobros

Ola Bonita usa **Checkout Redireccionado de Clip** para todos los anticipos y pagos completos de reservas web y de la cabina. La clienta paga en la página hospedada por Clip; Ola Bonita no recibe ni guarda datos de tarjeta.

## Terminal física (Clip PinPad)

La integración de PinPad está habilitada en el POS. La sección **Configuración → Pagos y anticipos → Configura Clip PinPad** guarda el número de serie y la preparación de la terminal. Al elegir **Terminal Clip** en una venta, la aplicación crea una intención de pago desde el backend; sólo registra la venta cuando Clip la confirma.

Antes de probar, la dueña debe:

1. Tener cuenta Clip activa y verificación de identidad (KYC) completa.
2. Confirmar un lector compatible: Clip Total 3, Ultra, Clip PinPad o Stand 2.
3. Copiar el número de serie del lector en la app y usar el botón para copiar la solicitud dirigida a Clip.
4. Solicitar a `developers@clip.mx` la habilitación de PinPad y la instalación de la aplicación Clip PinPad en el lector.
5. Usar credenciales de **Producción**. PinPad no dispone de ambiente de pruebas: requiere lector compatible y conexión Wi‑Fi estable.

Cuando Clip habilite PinPad, el POS envía el importe al lector identificado por ese número de serie y sólo registra venta, inventario, comisión y caja al recibir una confirmación de pago. Un fallo de señal nunca debe marcar un cobro como completado.

## Si falla internet durante un cobro de PinPad

- Si el POS no puede comunicarse con el backend antes de crear la intención, no se envía ningún cobro ni se registra una venta.
- Si Clip informa que la terminal está apagada, sin red o con la app PinPad cerrada, el intento falla y el ticket no se cobra ni registra.
- Si la terminal procesa el pago pero el navegador, webhook o backend se desconecta después, la venta queda pendiente: no altera caja, inventario ni comisiones. El cron de Vercel consulta Clip cada 10 minutos y la completa al confirmar el pago.
- Mientras un cobro esté pendiente, nunca se debe volver a cobrar el mismo ticket. Espera la confirmación o consulta el estado en Clip antes de crear un nuevo intento.

## Credenciales que necesitas

En el [Panel de Desarrollador de Clip](https://dashboard.clip.mx/), crea una credencial para el ambiente que usarás. Clip entrega dos valores:

1. **API Key**
2. **Clave secreta**

Conserva la clave secreta cuando Clip la muestre: Clip sólo permite verla una vez. Para producción, usa exclusivamente el par de credenciales de producción y confirma que Clip haya verificado la identidad de la cuenta.

## Dónde guardarlas

No agregues estas claves a código, Git, capturas, chats ni variables `NEXT_PUBLIC_*`.

1. Entra a `app.olabonita.shop` como administradora.
2. Abre **Configuración → Pagos y anticipos**.
3. Selecciona **Producción** (o **Pruebas** durante la validación).
4. Pega la API Key y la Clave secreta de Clip.
5. Presiona **Conectar Clip**.

La aplicación las cifra en Supabase Vault. Sólo el backend puede leerlas para formar el encabezado `Authorization: Basic …` que pide Clip; nunca se envían al navegador.

## Caducidad y conciliación automática

El valor **Vigencia del link** en Configuración → Pagos y anticipos se envía a Clip con cada checkout y queda guardado junto a esa reserva. Cambiar la regla sólo afecta enlaces nuevos.

Además, Vercel consulta cada 10 minutos los enlaces que aún están pendientes. Primero revisa los vencidos y después los activos más antiguos, en lotes limitados para no saturar Clip. Así, si un webhook se pierde, una reserva pagada se confirma y un link cancelado o vencido libera el horario. Antes de desplegar, crea una variable privada `CRON_SECRET` en Vercel (Production) con un valor largo y aleatorio; no la pongas en `NEXT_PUBLIC_*` ni en Supabase Vault. Vercel usará ese mismo valor para autorizar el cron.

Cada checkout también tiene una intención de cobro interna antes de crear el link. La reserva, el identificador de Clip y el registro de pago se finalizan dentro de una sola transacción de base de datos; el enlace sólo se entrega al navegador después de esa confirmación. Esto evita cobros sin reserva o pagos duplicados si una petición falla a la mitad.

Si una función se interrumpe antes de finalizar el checkout, el cron libera esa intención al vencer el mismo plazo del link. Clip sólo documenta creación y consulta de links para este checkout, por lo que un pago que llegue después de que el equipo cancele una cita nunca la reactiva automáticamente: queda como **requiere revisión** y fuera de los ingresos hasta que gerencia decida el siguiente paso.

## Webhook y URLs

La app envía esta URL al crear cada link de pago:

```text
https://app.olabonita.shop/api/webhooks/clip
```

No hace falta registrar ni exponer un secreto de webhook adicional: Clip envía un identificador mínimo de la solicitud. El endpoint de Ola Bonita usa ese identificador únicamente para consultar el estado directamente en la API de Clip antes de cambiar una reserva a pagada. También verifica que el importe coincida con la reserva.

Las clientas regresan a `www.olabonita.shop` después del pago; la confirmación financiera depende del webhook y de la consulta servidor-a-servidor, no de parámetros que lleguen desde el navegador.

## Prueba antes de activar producción

1. Guarda las credenciales de **Pruebas** en la pantalla de pagos.
2. Crea una reserva web con anticipo y otra de cabina.
3. Verifica que ambas abran una URL de `payclip.com`.
4. Completa la prueba y revisa que la reserva cambie de `pending` a `confirmed`, y de `pending` a `deposit_paid` o `paid`.
5. Repite con las credenciales de Producción antes de anunciar pagos en línea.
6. Para PinPad, con una terminal compatible conectada y activa, cobra una venta pequeña desde **Ventas y caja → Terminal Clip**. Confirma que la venta aparece sólo después de aprobarse en la terminal y repite una prueba simulando pérdida de red para comprobar la conciliación pendiente.

Si cambias de entorno o rotas claves, vuelve a guardarlas desde Configuración. Las claves anteriores dejan de ser válidas en cuanto las revoques en Clip.
