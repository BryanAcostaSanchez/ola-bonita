# Guía de inicio de Ola Bonita

Todo lo que hay que dejar configurado antes de abrir la agenda al público.
Esta guía es la versión escrita del tutorial que vive en la app, en
`/app/primeros-pasos`. Hay una versión para imprimir en
`/app/primeros-pasos/manual`.

El texto de los pasos se edita en un solo lugar, `src/lib/onboarding.ts`: la
página del tutorial, la ayuda contextual de cada sección de Configuración y el
manual imprimible leen de ahí, para que nadie lea dos versiones distintas de lo
mismo.

## Antes de empezar

Entra a **app.olabonita.shop** con tu correo y contraseña. La primera persona
que entra se convierte en la cuenta administradora del spa; desde ahí se crean
los demás accesos. Todo lo de esta guía vive en el menú **Configuración** y se
puede cambiar cuando quieras.

## 1. Datos de tu negocio

*Configuración → Cuenta y negocio*

El nombre, la zona horaria y la moneda que la app usa en la agenda, los tickets
y los reportes.

1. Revisa que el nombre comercial sea el que quieres que vean tus clientas.
2. Confirma la zona horaria; de ella dependen todos los horarios de la agenda.
3. Define con cuánta anticipación mínima se puede reservar desde el sitio web.

> La anticipación mínima evita que alguien reserve para dentro de diez minutos.
> Dos horas es un buen punto de partida.

## 2. Horarios de atención

*Configuración → Agenda web*

Los días y las horas en que la gente puede reservar desde olabonita.shop, y
cuántas citas caben a la vez.

1. Activa los días que abren y ajusta la hora de apertura y cierre de cada uno.
2. Elige cada cuánto se ofrecen horarios: cada 15, 30 o 60 minutos.
3. Define el máximo de reservas simultáneas según cuántas cabinas y personas
   tienes.

> Este horario es del negocio, no del equipo. La disponibilidad de cada
> especialista se configura aparte, en Equipo y nómina.

## 3. Servicios y precios

*Configuración → Catálogo y punto de venta*

El catálogo llega precargado con los servicios del spa, pero los precios y las
duraciones son los que tú decidas.

1. Revisa el precio y la duración de cada servicio y corrige lo que haya
   cambiado.
2. Apaga los servicios que ya no das y activa los que falten.
3. Decide cuáles se pueden reservar en línea y cuáles sólo se agendan desde
   recepción.
4. Si vendes productos en el mostrador, agrégalos con su precio y existencias.

> La duración incluye el tiempo que ocupa la cabina. Si necesitas limpiar entre
> citas, súmalo aquí para que la agenda no se empalme.

## 4. Tu equipo

*Configuración → Equipo y nómina*

Cada persona necesita su propio acceso, los servicios que sabe dar, su horario
y cómo se le paga.

1. Invita a cada persona con su nombre y correo; recibirá un correo para crear
   su contraseña.
2. Elige qué puede ver y hacer cada quien dentro de la app.
3. Marca los servicios que atiende y su horario de la semana.
4. Define su esquema de pago: sueldo fijo, comisión o una combinación de los
   dos.

> Sin servicios asignados ni horario, una especialista no aparece como
> disponible al reservar. Es el motivo más común de una agenda que se ve vacía.

## 5. Cobros y anticipos

*Configuración → Pagos y Clip*

Cómo se cobra: qué anticipo pide la web, qué pasa si alguien no llega y con qué
métodos cobras en el mostrador.

1. Decide si pides anticipo al reservar en línea y de qué porcentaje.
2. Elige qué pasa con ese anticipo cuando una clienta cancela o no se presenta.
3. Marca los métodos de pago que quieres tener disponibles al cobrar.
4. Conecta Clip con la API Key y la clave secreta de tu panel de Clip.
5. Si cobras con una terminal Clip, regístrala y elige qué método de pago le
   manda el cobro.

> Las credenciales de Clip se guardan cifradas y no se vuelven a mostrar. Ténlas
> a la mano antes de empezar, porque Clip sólo las enseña una vez.

El detalle técnico del checkout de Clip está en [`clip-checkout.md`](./clip-checkout.md).

## 6. Gastos del negocio

*Configuración → Gastos y etiquetas*

Las categorías y etiquetas con las que vas a clasificar cada gasto para después
poder analizarlo.

1. Revisa las categorías de gasto y agrega las que falten para tu operación.
2. Crea etiquetas para cruzar gastos entre categorías, como proveedor o
   sucursal.

> Vale la pena dedicarle unos minutos ahora: cambiar las categorías más adelante
> vuelve difícil comparar meses entre sí.

## 7. Renta de cabina (opcional)

*Configuración → Renta de cabina*

Sólo si rentas la cabina de masajes a alguien de fuera. Define su horario, su
precio y el apartado que pides.

1. Activa el espacio y ponle el horario en que se puede rentar.
2. Define el precio por hora y el apartado que se cobra al reservar.

> Si por ahora no rentas la cabina, marca este paso como «no aplica» y termina
> el tutorial sin él.

## Cuando ya esté todo listo

Haz una reserva de prueba desde **olabonita.shop** para confirmar que aparecen
los horarios, que se elige la especialista correcta y que el cobro del anticipo
llega a Clip. Cancélala después desde la agenda.

Si algo no aparece como esperabas, casi siempre es una de tres cosas: el
servicio no está marcado como reservable en línea, la especialista no tiene ese
servicio asignado, o ese día no está abierto en la agenda web.

## Cómo sabe la app qué pasos faltan

`src/lib/onboarding-progress.ts` lee la configuración real del negocio en cada
carga. Sólo tres pasos se detectan solos, porque son los únicos con una señal
que no viene precargada: **Tu equipo** (hay alguien más con acceso, servicios
asignados y horario activo), **Cobros y anticipos** (Clip guardado y métodos de
pago elegidos) y **Renta de cabina** (el espacio está activo, con horario y
precio).

Los demás pasos llegan con datos precargados en las migraciones, así que la app
no puede distinguir entre «ya lo revisé» y «nunca lo toqué». Ahí el tutorial
muestra cómo está configurado hoy y la dueña lo confirma a mano. Ese estado
—junto con los pasos marcados como «no aplica» y el recordatorio oculto— se
guarda en `business_settings.onboarding_step_states` y
`business_settings.onboarding_dismissed_at`, mediante los RPC
`set_onboarding_step` y `set_onboarding_dismissed`.
