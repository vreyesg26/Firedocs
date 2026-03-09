import type { RepoStatus } from "./git";

export type FieldKind = "text" | "select" | "multiselect";

export interface FieldOption {
  label: string;
  value: string;
}

export type FieldValue = string | string[];

export interface UIField {
  key: string; 
  label: string; 
  kind: FieldKind;
  value: FieldValue;
  options?: FieldOption[];
}

export interface UISection {
  id: string;
  title: string;
  fields: UIField[];
}

export interface PiezasItem {
  nombre: string;
  tipo: string;
  estado: "Nuevo" | "Modificado" | string;
  identificador?: "Hotfix" | "Bugfix" | "Incidencia" | string;
  fechaHoraModificacion?: string;
  sourcePath?: string;
}
export interface PiezasGrupo {
  grupo: string;
  items: PiezasItem[];
  sourceRepository?: string;
  sourceBranch?: string;
}

export interface BackupHeaderOneRow {
  responsibleTeam: string;
  databaseOrDirectory: string;
  application: string;
}

export interface BackupProcedureRow {
  step: string;
  objectToBackup: string;
}

export interface BackupHeaderThreeRow {
  server: string;
  additionalComments: string;
}

export interface BackupTableGroup {
  title: string;
  headerOne: BackupHeaderOneRow;
  procedureRows: BackupProcedureRow[];
  headerThree: BackupHeaderThreeRow;
}

export interface InstallationHeaderOneRow {
  implementingTeam: string;
  integrationBranch: string;
  repository: string;
}

export interface InstallationProcedureRow {
  step: string;
  objectToInstall: string;
  versionerPath: string;
}

export interface InstallationHeaderThreeRow {
  databaseOrDirectory: string;
  server: string;
}

export interface InstallationHeaderFourRow {
  applicationToImplement: string;
  additionalComments: string;
}

export interface InstallationTableGroup {
  title: string;
  headerOne: InstallationHeaderOneRow;
  procedureRows: InstallationProcedureRow[];
  headerThree: InstallationHeaderThreeRow;
  headerFour: InstallationHeaderFourRow;
}

export interface CommunicationMatrixRow {
  country: string;
  developerName: string;
  developerContact: string;
  repositories: string[];
  repositoriesInput?: string;
  pickerRepositories?: string[];
  bossName: string;
  bossContact: string;
}

export interface KeyValueField {
  key: string;
  value: string;
}

export interface ManualExtract {
  camposDetectados: KeyValueField[];
  piezasDetalladas: PiezasGrupo[];
  detailedFixPieces?: PiezasGrupo[];
  backupTables?: BackupTableGroup[];
  backupFixTables?: BackupTableGroup[];
  installationTables?: InstallationTableGroup[];
  reversionTables?: InstallationTableGroup[];
  installationFixTables?: InstallationTableGroup[];
  reversionFixTables?: InstallationTableGroup[];
  servicesProducts?: string[];
  affectedAreas?: string[];
  repositoryNames?: string[];
  communicationMatrix?: CommunicationMatrixRow[];
  previousStepsHtml?: string;
  seccionesReconocidas: UISection[];
  raw: { paragraphs: string[]; tables: string[][][] };
}

export type GitStatus =
  | "Nuevo"
  | "Modificado"
  | "Renombrado"
  | "Eliminado"
  | "Desconocido";

export interface GitFileChange {
  path: string;
  nombre: string;
  ext: string;
  tipo: string;
  estado: GitStatus;
}

export interface RepoChanges {
  repoName: string;
  repoPath: string;
  files: GitFileChange[];
}

export type FeatureKey = "existing" | "import" | "union";

export interface HomeFeatureProps {
  key: FeatureKey;
  title: string;
  description: string;
  icon: React.ElementType;
}

export interface StepsProps {
  key: string;
  label: string;
  description: string;
}

export type GithubChangesProps = {
  onOpen: (payload: { statuses: RepoStatus[]; repos: string[] }) => void;
  onLoadingChange?: (loading: boolean) => void;
};
