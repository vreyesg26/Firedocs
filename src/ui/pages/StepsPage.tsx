import { useEffect, useMemo, useState } from "react";
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
} from "@mantine/core";
import { steps } from "@/lib/constants";
import { useManual } from "@/context/ManualContext";
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconFileUpload,
} from "@tabler/icons-react";
import { mainColor } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
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

export default function StepsPage() {
  const navigate = useNavigate();
  const {
    data,
    sections,
    handleExport,
    manualTitle,
    setManualTitle,
    activeStep,
    setActiveStep,
    saveCurrentDraft,
  } = useManual();
  const normalizedActiveStep =
    typeof activeStep === "number" && Number.isFinite(activeStep)
      ? activeStep
      : 0;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [active, setActive] = useState<number>(normalizedActiveStep);
  const completed = active === steps.length;

  useEffect(() => {
    setActive(normalizedActiveStep);
  }, [normalizedActiveStep]);

  const percent = useMemo(
    () => Math.round((active / steps.length) * 100),
    [active],
  );

  const next = () => {
    const nextStep = Math.min(active + 1, steps.length);
    setActive(nextStep);
    setActiveStep(nextStep);
  };
  const prev = () => {
    const prevStep = Math.max(active - 1, 0);
    setActive(prevStep);
    setActiveStep(prevStep);
  };

  useEffect(() => {
    const step = steps[active];
    const title = completed
      ? "Manual completado"
      : (step?.description ?? "Manuales automatizados");
    void window.ipc.setWindowTitle(title);
  }, [active, completed]);

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

  if (!data || !sections) {
    return (
      <Container>
        <Text>No hay datos cargados</Text>
      </Container>
    );
  }

  return (
    <Container
      fluid
      px="lg"
      py="md"
      style={{
        minHeight: "calc(100vh - 60px - (var(--mantine-spacing-md) * 2))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Card withBorder>
        <Flex justify="space-between" align="center" gap="xs">
          <ActionIcon
            variant="subtle"
            color='white'
            onClick={() => navigate("/drafts")}
            aria-label="Volver a borradores"
          >
            <IconArrowLeft
              size='1.5rem'
            />
          </ActionIcon>
          <Box style={{ minWidth: 0, flex: 1 }}>
            {isEditingTitle ? (
              <TextInput
                value={manualTitle}
                onChange={(e) => setManualTitle(e.currentTarget.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingTitle(false);
                }}
                autoFocus
              />
            ) : (
              <Title
                fw={700}
                order={2}
                onDoubleClick={() => setIsEditingTitle(true)}
                style={{ cursor: "text" }}
              >
                {manualTitle || "Sin título"}
              </Title>
            )}
          </Box>
          <Button
            color={mainColor}
            onClick={handleSaveDraft}
            disabled={draftSaving}
            rightSection={draftSaving ? <Loader size={14} color="white" /> : null}
          >
            Guardar borrador
          </Button>
        </Flex>
      </Card>

      <Progress
        color={mainColor}
        value={percent}
        size="lg"
        radius="sm"
        mt="md"
      />
      <Group justify="space-between" my="xs">
        <Text fw={600}>Progreso del manual</Text>
        <Text c="dimmed">{percent}%</Text>
      </Group>

      <Box mt="md">{renderStepContent()}</Box>

      <Group justify="space-between" mt="auto" pt="xl">
        <Button
          leftSection={<IconChevronLeft size="1.1rem" />}
          variant="default"
          onClick={prev}
          disabled={active === 0}
        >
          Atrás
        </Button>

        <Flex gap="xs">
          <Button
            leftSection={<IconFileUpload size="1.1rem" />}
            onClick={handleExport}
            variant="outline"
            color="gray"
          >
            Exportar
          </Button>
          <Button
            rightSection={<IconChevronRight size="1.1rem" />}
            onClick={next}
            disabled={completed}
            color={mainColor}
          >
            {completed
              ? "Listo"
              : active < steps.length - 1
                ? "Siguiente"
                : "Finalizar"}
          </Button>
        </Flex>
      </Group>
    </Container>
  );
}
