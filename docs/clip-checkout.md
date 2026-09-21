# Clip: configuración segura de cobros

Ola Bonita usa **Checkout Redireccionado de Clip** para todos los anticipos y pagos completos de reservas web y de la cabina. La clienta paga en la página hospedada por Clip; Ola Bonita no recibe ni guarda datos de tarjeta.

## Terminal física (Clip PinPad)

Al cobrar con el método de pago marcado como «en la terminal», el POS manda el importe exacto al lector y espera su respuesta. La venta se registra sólo cuando Clip confirma que la tarjeta se aprobó. Un fallo de señal nunca marca un cobro como completado.

### Lo que hace el POS

1. Escribe una intención de cobro en la base de datos **antes** de hablar con Clip, así ningún cobro puede existir en la terminal sin una fila con la cual conciliarlo.
2. Envía el importe a Clip con el número de serie del lector y una referencia única.
3. Muestra la pantalla de espera y consulta el estado cada 2.5 segundos, siempre releyendo el cobro desde Clip: el navegador nunca decide que una tarjeta se aprobó.
4. Si se aprueba, crea la venta con el pago ligado al identificador de Clip. Si se rechaza o se cancela, deja el ticket abierto y explica el motivo.
5. Deja de esperar a los cinco minutos y cancela el cobro para no bloquear la terminal.

### Lo que funciona aunque el navegador falle

- **Recargar o cerrar la pestaña:** el cobro sigue vivo en la terminal. Al volver, el POS le pregunta al servidor si este cajero tiene un cobro pendiente y retoma la pantalla en lugar de mandar otro. El identificador también queda en `localStorage`, pero sólo como atajo: la base de datos es la fuente de verdad.
- **Salidas accidentales:** mientras se espera, el navegador pregunta antes de cerrar o recargar.
- **Pantalla:** si el navegador lo soporta, se mantiene encendida con la Wake Lock API.
- **Sesión vencida:** una pestaña abierta durante horas renueva su sesión y reintenta una vez ante un 401. Un 403 (sin permiso) no se reintenta.
- **Cobros colgados:** una terminal Clip sólo acepta un cobro a la vez. Si uno quedó abierto, el POS lo cancela en ese aparato y reintenta **una** vez. El cron también limpia los que ya pasaron sus cinco minutos.

### Cuenta dividida

Sólo la parte marcada con el método de la terminal se envía al aparato; el resto (efectivo, transferencia) queda registrado a mano en la misma venta. Cuando Clip aprueba, la venta se crea completa: el renglón de la terminal lleva `provider` y `provider_reference`, y los demás no.

### Salida manual

**Cobrar a mano en el aparato** existe para cuando no hay internet o la terminal falla. Pide una confirmación en dos pasos y guarda el pago **sin** `provider` ni `provider_reference`, para que el corte de caja nunca lo cuente como confirmado por Clip.

### Preparar la terminal

La sección **Configuración → Pagos y anticipos → Cobrar en la terminal Clip** guía el trámite completo y muestra el estado real del lector consultando a Clip, no el que alguien escribió al darlo de alta.

1. Cuenta Clip activa, con verificación de identidad (KYC) terminada y credenciales de **Producción** guardadas.
2. Un lector compatible. La documentación de Clip se contradice entre páginas: la introducción de la API de PinPad nombra Total 3, Ultra, Clip PinPad y Stand 2, mientras que otras páginas nombran Pro 2, Total y Total 2. Lo seguro es que debe ser un lector Android con pantalla; los Bluetooth (Clip Plus, Clip Mini) no sirven. **Confirma el modelo por escrito con Clip antes de comprar.**
3. Clip tiene que instalar la app **Clip PinPad** en el lector. Se solicita por correo a `sdk@payclip.com` con el número de serie; la pantalla de Ajustes trae la solicitud lista para copiar.
4. Marcar la terminal como **Lista para cobrar** y elegir qué método de pago la usa. Ese interruptor es lo que dispara el cobro en terminal, no el nombre del método.

### Sin ambiente de pruebas

Clip dice explícitamente que la API de PinPad **opera únicamente en Producción** y que no hay sandbox ni tarjetas de prueba. Se prueba cobrando montos mínimos reales; Clip indica que los bancos mexicanos aceptan desde $1.00 MXN. Los comercios nuevos tienen un tope inicial de $5,000 MXN por transacción.

La primera prueba debe ser de **$1.00 MXN**, verificando en la app de Clip que cobró un peso: la documentación de Clip es inconsistente sobre si el monto va en pesos o en centavos, y el POS lo manda en pesos con dos decimales según su ejemplo oficial.

### Webhook sin firma

Clip no documenta ninguna firma, HMAC ni secreto para validar sus webhooks, ni para la terminal ni para el checkout. El aviso que manda es mínimo: un identificador, sin estado ni monto. Por eso:

- La URL que le damos a Clip lleva un token secreto (`CLIP_WEBHOOK_TOKEN`), que sólo evita ruido de terceros en el endpoint.
- El cuerpo del webhook **nunca** se cree: cada aviso se confirma releyendo el cobro desde la API de Clip antes de tocar una venta.
- El importe se compara contra el de la intención. Si no coincide, la venta no se cierra y el cobro queda como **requiere revisión**.

### Si algo queda a medias

Si la terminal aprueba el pago pero la venta no se puede escribir, el cobro queda como **requiere revisión**: no se cobra dos veces y no se pierde el pago. El POS avisa al cajero que no vuelva a cobrar y que escale a gerencia.

## Ventas sin conexión

En **Ventas y caja**, una venta de efectivo, transferencia o tarjeta manual puede guardarse sin conexión en una bandeja local del dispositivo. Cuando vuelve internet, se sincroniza automáticamente con el mismo identificador de venta, por lo que un reintento no duplica el registro.

Si se eligió el método que cobra en la terminal mientras no había red, el ticket queda como **Clip por verificar**. No se sube como pagado automáticamente: la persona responsable debe comprobar el recibo físico y elegir **Confirmar como tarjeta manual**. Así se evita inventar una confirmación de Clip que nunca pudo crear una intención remota.

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

Además, Vercel consulta cada 10 minutos los enlaces y los cobros en terminal que aún están pendientes. Primero revisa los vencidos y después los activos más antiguos, en lotes limitados para no saturar Clip. Así, si un webhook se pierde, una reserva pagada se confirma y un link cancelado o vencido libera el horario. Antes de desplegar, crea una variable privada `CRON_SECRET` en Vercel (Production) con un valor largo y aleatorio; no la pongas en `NEXT_PUBLIC_*` ni en Supabase Vault. Vercel usará ese mismo valor para autorizar el cron.

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
6. Para la terminal, con un lector compatible encendido y con la app Clip PinPad abierta, cobra **$1.00 MXN** desde **Ventas y caja**. Recorre uno por uno estos casos y confirma el resultado en la app de Clip:
   - Aprobado: la venta aparece sólo después de aprobarse en la terminal.
   - Rechazado: el ticket sigue abierto y se explica el motivo.
   - Cancelado desde el POS antes de pasar la tarjeta.
   - Recarga la página a media espera: debe retomarse la misma pantalla, sin cobrar dos veces.
   - Terminal apagada: el error debe explicar la causa, no girar sin fin.
   - Cuenta dividida: sólo la parte con tarjeta llega a la terminal.

### Corte de caja

El corte separa lo **confirmado por Clip** (con identificador de pago) de lo **cobrado a mano**, cada uno con su número de operaciones. La parte manual hay que cuadrarla contra el reporte de la app de Clip. El efectivo contado nunca se rellena con lo esperado.

Si cambias de entorno o rotas claves, vuelve a guardarlas desde Configuración. Las claves anteriores dejan de ser válidas en cuanto las revoques en Clip.
