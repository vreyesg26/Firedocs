import {
  IconBlendMode,
  IconFileDescription,
  IconFileUpload,
} from "@tabler/icons-react";
import type { FieldOption, HomeFeatureProps, StepsProps } from "@/types/manual";

export const steps: StepsProps[] = [
  { key: "general", label: "Paso 1", description: "Información general" },
  { key: "pieces", label: "Paso 2", description: "Piezas detalladas" },
  {
    key: "pieces-fixes",
    label: "Paso 3",
    description: "Piezas detalladas para Bugfix, Hotfix e Incidencias",
  },
  { key: "services", label: "Paso 4", description: "Listar áreas y servicios" },
  {
    key: "repos",
    label: "Paso 5",
    description: "Repositorios y matriz de comunicación",
  },
  { key: "prevsteps", label: "Paso 6", description: "Describir pasos previos" },
  { key: "backup", label: "Paso 7", description: "Respaldo de objetos" },
  { key: "installation", label: "Paso 8", description: "Pasos de instalación" },
  { key: "reversion", label: "Paso 9", description: "Pasos de reversión" },
  { key: "backup-fix", label: "Paso 10", description: "Respaldo de objetos para Bugfix/Hotfix" },
  {
    key: "installation-fix",
    label: "Paso 11",
    description: "Pasos de instalación para Bugfix/Hotfix",
  },
  { key: "reversion-fix", label: "Paso 12", description: "Pasos de reversión para Bugfix/Hotfix" },
];

export const hiddenByDefaultStepKeys = [
  "pieces-fixes",
  "backup-fix",
  "installation-fix",
  "reversion-fix",
] as const;

export function getDefaultVisibleStepKeys() {
  const hidden = new Set<string>(hiddenByDefaultStepKeys);
  return steps
    .map((step) => step.key)
    .filter((stepKey) => !hidden.has(stepKey));
}

export const mainButtonsData: HomeFeatureProps[] = [
  {
    key: "existing",
    title: "Usar plantilla existente",
    description:
      "Selecciona una de las plantillas predefinidas para crear un manual de instalación desde cero.",
    icon: IconFileDescription,
  },
  {
    key: "import",
    title: "Importar documento",
    description:
      "Si ya tienes un documento iniciado, puedes importarlo fácilmente para editarlo según tus necesidades.",
    icon: IconFileUpload,
  },
  {
    key: "union",
    title: "Unir documentos",
    description:
      "Si tienes varios documentos, puedes unirlos fácilmente para crear un manual de instalación completo.",
    icon: IconBlendMode,
  },
];

export const countryOptions: Readonly<FieldOption[]> = [
  { value: "REG", label: "Regional (REG)" },
  { value: "HN", label: "Honduras (HN)" },
  { value: "GT", label: "Guatemala (GT)" },
  { value: "PA", label: "Panamá (PA)" },
  { value: "NI", label: "Nicaragua (NI)" },
];
