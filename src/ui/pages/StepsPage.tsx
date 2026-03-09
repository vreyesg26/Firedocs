import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader,
  Container,
  Progress,
  Group,
  Text,
  Button,
  Box,
  Flex,
  TextInput,
  Title,
  Card,
  ActionIcon,
  Switch,
} from "@mantine/core";
import { getDefaultVisibleStepKeys, hiddenByDefaultStepKeys, steps } from "@/lib/constants";
import { useManual } from "@/context/ManualContext";
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { mainColor } from "@/lib/utils";
import { Navigate, useNavigate } from "react-router-dom";
import { getManualProgress } from "@/lib/manual-progress";
import {
  EighthStep,
  EleventhStep,
  FifthStep,
  FirstStep,
  FourthStep,
  NinthStep,
  SecondStep,
  SeventhStep,
  SixthStep,
  TenthStep,
  ThirdStep,
  TwelfthStep,
} from "./steps";
import type {
  BackupTableGroup,
  CommunicationMatrixRow,
  InstallationTableGroup,
  PiezasGrupo,
  UISection,
} from "@/types/manual";

const fixFlowStepKeys = [...hiddenByDefaultStepKeys];

export default function StepsPage() {
  const navigate = useNavigate();
  const {
    data,
    sections,
    detailedPieces,
    detailedFixPieces,
    servicesProducts,
    affectedAreas,
    repositoryNames,
    communicationMatrix,
    installationTables,
    reversionTables,
    backupFixTables,
    installationFixTables,
    reversionFixTables,
    //handleExport,
    manualTitle,
    setManualTitle,
    activeStep,
    setActiveStep,
    draftId,
    hasUnsavedChanges,
    saveCurrentDraft,
    visibleStepKeys,
    setVisibleStepKeys,
  } = useManual() as {
    data: unknown;
    sections: UISection[] | null;
    detailedPieces: PiezasGrupo[];
    detailedFixPieces: PiezasGrupo[];
    servicesProducts: string[];
    affectedAreas: string[];
    repositoryNames: string[];
    communicationMatrix: CommunicationMatrixRow[];
    installationTables: InstallationTableGroup[];
    reversionTables: InstallationTableGroup[];
    backupFixTables: BackupTableGroup[];
    installationFixTables: InstallationTableGroup[];
    reversionFixTables: InstallationTableGroup[];
    handleExport: () => Promise<void>;
    manualTitle: string;
    setManualTitle: (value: string) => void;
    activeStep: number;
    setActiveStep: (value: number) => void;
    draftId: string | null;
    hasUnsavedChanges: boolean;
    saveCurrentDraft: () => Promise<{ id?: string } | undefined>;
    visibleStepKeys: string[];
    setVisibleStepKeys: (value: string[]) => void;
  };
  const normalizedActiveStep =
    typeof activeStep === "number" && Number.isFinite(activeStep)
      ? activeStep
      : 0;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [active, setActive] = useState<number>(normalizedActiveStep);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActive(normalizedActiveStep);
  }, [normalizedActiveStep]);

  const normalizedVisibleStepKeys = useMemo(() => {
    const availableKeys = new Set(steps.map((step) => step.key));
    const filtered = (visibleStepKeys ?? []).filter((key) => availableKeys.has(key));
    return filtered.length > 0 ? filtered : [steps[0]?.key].filter(Boolean);
  }, [visibleStepKeys]);

  const visibleSteps = useMemo(
    () => steps.filter((step) => normalizedVisibleStepKeys.includes(step.key)),
    [normalizedVisibleStepKeys],
  );

  const isFixFlowEnabled = useMemo(
    () => fixFlowStepKeys.every((stepKey) => normalizedVisibleStepKeys.includes(stepKey)),
    [normalizedVisibleStepKeys],
  );

  useEffect(() => {
    if (!steps[active] || normalizedVisibleStepKeys.includes(steps[active].key)) {
      return;
    }

    const fallbackStep = steps.findIndex((step) =>
      normalizedVisibleStepKeys.includes(step.key),
    );
    const nextActive = fallbackStep >= 0 ? fallbackStep : 0;
    setActive(nextActive);
    setActiveStep(nextActive);
  }, [active, normalizedVisibleStepKeys, setActiveStep]);

  const currentVisibleIndex = useMemo(
    () => visibleSteps.findIndex((step) => step.key === steps[active]?.key),
    [active, visibleSteps],
  );

  const progress = useMemo(
    () =>
      getManualProgress({
        sections,
        detailedPieces,
        detailedFixPieces,
        servicesProducts,
        affectedAreas,
        repositoryNames,
        communicationMatrix,
        installationTables,
        reversionTables,
        backupFixTables,
        installationFixTables,
        reversionFixTables,
        visibleStepKeys: normalizedVisibleStepKeys,
      }),
    [
      affectedAreas,
      backupFixTables,
      communicationMatrix,
      detailedFixPieces,
      detailedPieces,
      installationFixTables,
      installationTables,
      normalizedVisibleStepKeys,
      repositoryNames,
      reversionFixTables,
      reversionTables,
      sections,
      servicesProducts,
    ],
  );

  const isCurrentStepComplete = useMemo(() => {
    const currentStepKey = steps[active]?.key;
    if (!currentStepKey) return false;
    return progress.completionByStepKey[currentStepKey] ?? false;
  }, [active, progress]);

  const next = () => {
    if (currentVisibleIndex >= visibleSteps.length - 1) {
      navigate("/preview");
      return;
    }
    const nextStep = visibleSteps[currentVisibleIndex + 1];
    if (!nextStep) return;
    const nextStepIndex = steps.findIndex((step) => step.key === nextStep.key);
    setActive(nextStepIndex);
    setActiveStep(nextStepIndex);
  };
  const prev = () => {
    if (currentVisibleIndex <= 0) return;
    const prevStep = visibleSteps[currentVisibleIndex - 1];
    if (!prevStep) return;
    const prevStepIndex = steps.findIndex((step) => step.key === prevStep.key);
    setActive(prevStepIndex);
    setActiveStep(prevStepIndex);
  };

  useEffect(() => {
    const step = steps[active];
    const title = step?.description ?? "Manuales automatizados";
    void window.ipc.setWindowTitle(title);
  }, [active]);

  useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  async function handleSaveDraft() {
    setDraftSaving(true);
    try {
      const saved = await saveCurrentDraft();
      if (saved?.id) {
        alert("Borrador guardado correctamente.");
      } else {
        alert("No se pudo guardar el borrador.");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      alert(msg);
    } finally {
      setDraftSaving(false);
    }
  }

  const renderStepContent = () => {
    const key = steps[active]?.key;

    switch (key) {
      case "general":
        return <FirstStep />;
      case "pieces":
        return <SecondStep />;
      case "pieces-fixes":
        return <ThirdStep />;
      case "services":
        return <FourthStep />;
      case "repos":
        return <FifthStep />;
      case "prevsteps":
        return <SixthStep />;
      case "backup":
        return <SeventhStep />;
      case "installation":
        return <EighthStep />;
      case "reversion":
        return <NinthStep />;
      case "backup-fix":
        return <TenthStep />;
      case "installation-fix":
        return <EleventhStep />;
      case "reversion-fix":
        return <TwelfthStep />;
      default:
        return null;
    }
  };

  function handleToggleFixFlow(enabled: boolean) {
    const defaultVisibleKeys = getDefaultVisibleStepKeys();
    const nextVisibleKeys = enabled
      ? steps.map((step) => step.key)
      : defaultVisibleKeys;
    setVisibleStepKeys(nextVisibleKeys);
  }

  if (!data || !sections) {
    return <Navigate to="/" replace />;
  }

  return (
    <Container
      fluid
      px="lg"
      pt="md"
      pb={0}
      style={{
        minHeight: "calc(100dvh - 60px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Card withBorder>
        <Flex justify="space-between" align="center" gap="xs">
          <ActionIcon
            variant="subtle"
            color="white"
            onClick={() => navigate("/drafts")}
            aria-label="Volver a borradores"
          >
            <IconArrowLeft size="1.5rem" />
          </ActionIcon>
          <Box
            style={{
              minWidth: 0,
              flex: 1,
              height:
                "calc(var(--mantine-h2-font-size) * var(--mantine-h2-line-height))",
              position: "relative",
            }}
          >
            <Title
              fw={700}
              order={2}
              onDoubleClick={() => setIsEditingTitle(true)}
              style={{
                cursor: "text",
                lineHeight: "var(--mantine-h2-line-height)",
                margin: 0,
                position: "absolute",
                inset: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: isEditingTitle ? 0 : 1,
                pointerEvents: isEditingTitle ? "none" : "auto",
              }}
            >
              {manualTitle || "Sin título"}
            </Title>
            <TextInput
              ref={titleInputRef}
              value={manualTitle}
              onChange={(e) => setManualTitle(e.currentTarget.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditingTitle(false);
              }}
              variant="unstyled"
              styles={{
                root: {
                  width: "100%",
                  position: "absolute",
                  inset: 0,
                  opacity: isEditingTitle ? 1 : 0,
                  pointerEvents: isEditingTitle ? "auto" : "none",
                },
                input: {
                  width: "100%",
                  padding: 0,
                  margin: 0,
                  height:
                    "calc(var(--mantine-h2-font-size) * var(--mantine-h2-line-height))",
                  minHeight:
                    "calc(var(--mantine-h2-font-size) * var(--mantine-h2-line-height))",
                  lineHeight: "var(--mantine-h2-line-height)",
                  fontSize: "var(--mantine-h2-font-size)",
                  fontWeight: 700,
                },
              }}
            />
          </Box>
          {hasUnsavedChanges && (
            <Button
              color={mainColor}
              onClick={handleSaveDraft}
              disabled={draftSaving}
              rightSection={
                draftSaving ? <Loader size={14} color="white" /> : null
              }
            >
              {draftId ? "Guardar borrador" : "Crear borrador"}
            </Button>
          )}
          <Switch
            checked={isFixFlowEnabled}
            onChange={(event) =>
              handleToggleFixFlow(event.currentTarget.checked)
            }
            label="Incluye Bugfix/Hotfix"
            size="sm"
          />
        </Flex>
      </Card>

      <Progress
        color={mainColor}
        value={progress.percent}
        size="lg"
        radius="sm"
        mt="md"
      />
      <Group justify="space-between" my="xs">
        <Text fw={600}>Progreso del manual</Text>
        <Text c="dimmed">{progress.percent}%</Text>
      </Group>

      <Box my="md">{renderStepContent()}</Box>

      <Box mt="auto" style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Button
            leftSection={<IconChevronLeft size="1.1rem" />}
            variant="default"
            onClick={prev}
            disabled={currentVisibleIndex <= 0}
          >
            Atrás
          </Button>

          <Flex
            gap="xs"
            wrap="wrap"
            justify="flex-end"
            style={{ marginLeft: "auto" }}
          >
            {/* <Button
              leftSection={<IconFileUpload size="1.1rem" />}
              onClick={handleExport}
              variant="outline"
              color="gray"
            >
              Exportar
            </Button> */}
            <Button
              rightSection={<IconChevronRight size="1.1rem" />}
              onClick={next}
              color={mainColor}
              disabled={!isCurrentStepComplete}
            >
              {currentVisibleIndex < visibleSteps.length - 1
                ? "Siguiente"
                : "Vista previa"}
            </Button>
          </Flex>
        </Group>
      </Box>
    </Container>
  );
}
