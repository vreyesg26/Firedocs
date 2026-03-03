import { useState, useMemo } from "react";
import {
  Container,
  Progress,
  Group,
  Text,
  Button,
  Box,
  Flex,
} from "@mantine/core";
import { steps } from "@/lib/constants";
import { useManual } from "@/context/ManualContext";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFileUpload,
} from "@tabler/icons-react";
import { mainColor } from "@/lib/utils";
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
  const { data, sections, handleExport } = useManual();
  const [active, setActive] = useState(0);
  const completed = active === steps.length;

  const percent = useMemo(
    () => Math.round((active / steps.length) * 100),
    [active],
  );

  const next = () => setActive((a) => Math.min(a + 1, steps.length));
  const prev = () => setActive((a) => Math.max(a - 1, 0));

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
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Progreso del manual</Text>
        <Text c="dimmed">{percent}%</Text>
      </Group>

      <Progress color={mainColor} value={percent} size="lg" radius="sm" />

      <Box mt="xl">{renderStepContent()}</Box>

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
