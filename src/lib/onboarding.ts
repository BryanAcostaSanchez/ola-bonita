import type { Permission } from "@/lib/permissions";

export const ONBOARDING_STEP_IDS = [
  "cuenta",
  "agenda",
  "catalogo",
  "equipo",
  "pagos",
  "finanzas",
  "cabina",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];
export type OnboardingStepState = "pending" | "done" | "skipped";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  /** Qué es y por qué importa, en una frase. */
  summary: string;
  /** Lo que hay que hacer en la sección, en orden. */
  actions: string[];
  /** Lo que conviene saber antes de decidir. */
  tip: string;
  path: string;
  permission: Permission;
  /** Un paso opcional se puede marcar como "no aplica" sin dejar el tutorial a medias. */
  optional?: boolean;
  /**
   * Un paso se confirma a mano cuando la app no puede distinguir entre los
   * datos que vienen precargados y una revisión real del negocio.
   */
  confirmedByHand: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "cuenta",
    title: "Datos de tu negocio",
    summary:
      "El nombre, la zona horaria y la moneda que la app usa en la agenda, los tickets y los reportes.",
    actions: [
      "Revisa que el nombre comercial sea el que quieres que vean tus clientas.",
      "Confirma la zona horaria; de ella dependen todos los horarios de la agenda.",
      "Define con cuánta anticipación mínima se puede reservar desde el sitio web.",
    ],
    tip: "La anticipación mínima evita que alguien reserve para dentro de diez minutos. Dos horas es un buen punto de partida.",
    path: "/app/configuracion/cuenta",
    permission: "settings.agenda",
    confirmedByHand: true,
  },
  {
    id: "agenda",
    title: "Horarios de atención",
    summary:
      "Los días y las horas en que la gente puede reservar desde olabonita.shop, y cuántas citas caben a la vez.",
    actions: [
      "Activa los días que abren y ajusta la hora de apertura y cierre de cada uno.",
      "Elige cada cuánto se ofrecen horarios: cada 15, 30 o 60 minutos.",
      "Define el máximo de reservas simultáneas según cuántas cabinas y personas tienes.",
    ],
    tip: "Este horario es del negocio, no del equipo. La disponibilidad de cada especialista se configura aparte, en Equipo y nómina.",
    path: "/app/configuracion/agenda",
    permission: "settings.agenda",
    confirmedByHand: true,
  },
  {
    id: "catalogo",
    title: "Servicios y precios",
    summary:
      "El catálogo llega precargado con los servicios del spa, pero los precios y las duraciones son los que tú decidas.",
    actions: [
      "Revisa el precio y la duración de cada servicio y corrige lo que haya cambiado.",
      "Apaga los servicios que ya no das y activa los que falten.",
      "Decide cuáles se pueden reservar en línea y cuáles sólo se agendan desde recepción.",
      "Si vendes productos en el mostrador, agrégalos con su precio y existencias.",
    ],
    tip: "La duración incluye el tiempo que ocupa la cabina. Si necesitas limpiar entre citas, súmalo aquí para que la agenda no se empalme.",
    path: "/app/configuracion/catalogo",
    permission: "settings.catalog",
    confirmedByHand: true,
  },
  {
    id: "equipo",
    title: "Tu equipo",
    summary:
      "Cada persona necesita su propio acceso, los servicios que sabe dar, su horario y cómo se le paga.",
    actions: [
      "Invita a cada persona con su nombre y correo; recibirá un correo para crear su contraseña.",
      "Elige qué puede ver y hacer cada quien dentro de la app.",
      "Marca los servicios que atiende y su horario de la semana.",
      "Define su esquema de pago: sueldo fijo, comisión o una combinación de los dos.",
    ],
    tip: "Sin servicios asignados ni horario, una especialista no aparece como disponible al reservar. Es el motivo más común de una agenda que se ve vacía.",
    path: "/app/configuracion/nomina",
    permission: "team.manage",
    confirmedByHand: false,
  },
  {
    id: "pagos",
    title: "Cobros y anticipos",
    summary:
      "Cómo se cobra: qué anticipo pide la web, qué pasa si alguien no llega y con qué métodos cobras en el mostrador.",
    actions: [
      "Decide si pides anticipo al reservar en línea y de qué porcentaje.",
      "Elige qué pasa con ese anticipo cuando una clienta cancela o no se presenta.",
      "Marca los métodos de pago que quieres tener disponibles al cobrar.",
      "Conecta Clip con la API Key y la clave secreta de tu panel de Clip.",
      "Si cobras con una terminal Clip, regístrala y elige qué método de pago le manda el cobro.",
    ],
    tip: "Las credenciales de Clip se guardan cifradas y no se vuelven a mostrar. Ténlas a la mano antes de empezar, porque Clip sólo las enseña una vez.",
    path: "/app/configuracion/pagos",
    permission: "settings.payments",
    confirmedByHand: false,
  },
  {
    id: "finanzas",
    title: "Gastos del negocio",
    summary:
      "Las categorías y etiquetas con las que vas a clasificar cada gasto para después poder analizarlo.",
    actions: [
      "Revisa las categorías de gasto y agrega las que falten para tu operación.",
      "Crea etiquetas para cruzar gastos entre categorías, como proveedor o sucursal.",
    ],
    tip: "Vale la pena dedicarle unos minutos ahora: cambiar las categorías más adelante vuelve difícil comparar meses entre sí.",
    path: "/app/configuracion/finanzas",
    permission: "settings.finance",
    confirmedByHand: true,
  },
  {
    id: "cabina",
    title: "Renta de cabina",
    summary:
      "Sólo si rentas la cabina de masajes a alguien de fuera. Define su horario, su precio y el apartado que pides.",
    actions: [
      "Activa el espacio y ponle el horario en que se puede rentar.",
      "Define el precio por hora y el apartado que se cobra al reservar.",
    ],
    tip: "Si por ahora no rentas la cabina, marca este paso como “no aplica” y termina el tutorial sin él.",
    path: "/app/configuracion/cabina",
    permission: "settings.cabin",
    optional: true,
    confirmedByHand: false,
  },
];

export function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return (
    typeof value === "string" &&
    (ONBOARDING_STEP_IDS as readonly string[]).includes(value)
  );
}
