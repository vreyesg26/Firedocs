import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Center,
  Code,
  Container,
  Flex,
  Group,
  Modal,
  SimpleGrid,
  Text,
  Title,
} from "@mantine/core";
import classes from "./HomePage.module.css";
import { mainButtonsData } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { useManual } from "@/context/ManualContext";
import { mainColor } from "@/lib/utils";
import { IconCircleArrowRightFilled, IconInfoCircle } from "@tabler/icons-react";

type AppMeta = {
  appName: string;
  version: string;
  platform: string;
  arch: string;
  gitBinary: string;
  logPath: string;
  buildCommit: string;
  buildDate: string;
};

export default function HomePage() {
  const navigate = useNavigate();
  const { handleOpen, handleOpenUnion } = useManual() as {
    handleOpen: () => Promise<boolean | undefined>;
    handleOpenUnion: () => Promise<boolean>;
  };
  const [hasDrafts, setHasDrafts] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);

  useEffect(() => {
    void window.ipc.setWindowTitle();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const drafts = await window.ipc.draftList();
      if (mounted) setHasDrafts(drafts.length > 0);
      const meta = await window.ipc.getAppMeta();
      if (mounted) setAppMeta(meta);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onImportClick = async () => {
    const ok = await handleOpen();
    if (ok) navigate("/import");
  };

  const onUnionClick = async () => {
    const ok = await handleOpenUnion();
    if (ok) navigate("/import");
  };

  const features = mainButtonsData.map((feature) => (
    <Card
      key={feature.title}
      shadow="md"
      radius="md"
      className={classes.card}
      padding="xl"
      onClick={
        feature.key === "import"
          ? onImportClick
          : feature.key === "union"
            ? onUnionClick
            : () => navigate("/templates")
      }
    >
      <feature.icon size={50} stroke={1.5} />
      <Text fz="lg" fw={500} className={classes.cardTitle} mt="md">
        {feature.title}
      </Text>
      <Text fz="sm" c="dimmed" mt="sm">
        {feature.description}
      </Text>
    </Card>
  ));

  return (
    <Center style={{ minHeight: "100vh" }}>
      <Container strategy="grid" size="lg" py="xl" fluid>
        <Flex justify="center" align="center" gap="xs">
          <Badge variant="filled" size="lg" color={mainColor}>
            Firedocs
          </Badge>
          <Text size="sm">
            Versión {appMeta?.version || "desconocida"}
            {appMeta?.buildCommit ? ` • Build ${appMeta.buildCommit}` : ""}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setAboutOpen(true)}
            aria-label="Abrir información de la aplicación"
          >
            <IconInfoCircle size="1.1rem" />
          </ActionIcon>
        </Flex>

        <Title order={2} className={classes.title} ta="center" mt="sm">
          Manuales de instalación automatizados
        </Title>

        <Text c="dimmed" className={classes.description} ta="center" mt="md">
          Este sistema le permite crear manuales de instalación de manera rápida
          y sencilla, optimizando su tiempo y recursos.
        </Text>
        <SimpleGrid
          cols={{ base: 1, sm: 1, md: features.length, lg: features.length }}
          spacing="sm"
          mx="md"
          mt={50}
        >
          {features}
        </SimpleGrid>
        {hasDrafts && (
          <Group justify="center" gap="xs" mt="sm">
            <Card
              shadow="md"
              radius="md"
              className={classes.card}
              onClick={() => navigate("/drafts")}
            >
              <Flex align="center" gap={4}>
                <Text>Continuar a partir de un borrador</Text>
                <ActionIcon variant="transparent" color="white">
                  <IconCircleArrowRightFilled size="1.2rem" stroke={1.5} />
                </ActionIcon>
              </Flex>
            </Card>
          </Group>
        )}
        <Group justify="center" gap="xs" mt="lg">
          <Flex align="center" gap={4}>
            <Text>Desarrollado por</Text>
            <Text fw={700} c={mainColor}>
              Victor Reyes
            </Text>
          </Flex>
        </Group>
        <Group justify="center" mt="xs">
          <Text size="xs" c="dimmed">
            {appMeta
              ? `v${appMeta.version} • ${appMeta.platform}-${appMeta.arch}`
              : "Cargando información del build"}
          </Text>
        </Group>
      </Container>

      <Modal
        opened={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="Acerca de / Diagnóstico"
        centered
        radius="md"
      >
        <Flex direction="column" gap="sm">
          <Box>
            <Text fw={600}>Aplicación</Text>
            <Code block>{appMeta?.appName || "Firedocs"}</Code>
          </Box>
          <Box>
            <Text fw={600}>Versión</Text>
            <Code block>{appMeta?.version || "No disponible"}</Code>
          </Box>
          <Box>
            <Text fw={600}>Build</Text>
            <Code block>{appMeta?.buildCommit || "No disponible"}</Code>
          </Box>
          <Box>
            <Text fw={600}>Fecha de build</Text>
            <Code block>{appMeta?.buildDate || "No disponible"}</Code>
          </Box>
          <Box>
            <Text fw={600}>Plataforma</Text>
            <Code block>
              {appMeta ? `${appMeta.platform}-${appMeta.arch}` : "No disponible"}
            </Code>
          </Box>
          <Box>
            <Text fw={600}>Binario Git detectado</Text>
            <Code block>{appMeta?.gitBinary || "No disponible"}</Code>
          </Box>
          <Box>
            <Text fw={600}>Ruta del log</Text>
            <Code block>{appMeta?.logPath || "No disponible"}</Code>
          </Box>
        </Flex>
      </Modal>
    </Center>
  );
}
