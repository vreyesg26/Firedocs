import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Center,
  Container,
  Flex,
  Group,
  SimpleGrid,
  Text,
  Title,
} from "@mantine/core";
import classes from "./HomePage.module.css";
import { mainButtonsData } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { useManual } from "@/context/ManualContext";
import { mainColor } from "@/lib/utils";
import { IconCircleArrowRightFilled } from "@tabler/icons-react";

export default function HomePage() {
  const navigate = useNavigate();
  const { handleOpen, handleOpenUnion } = useManual() as {
    handleOpen: () => Promise<boolean | undefined>;
    handleOpenUnion: () => Promise<boolean>;
  };
  const [hasDrafts, setHasDrafts] = useState(false);

  useEffect(() => {
    void window.ipc.setWindowTitle();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const drafts = await window.ipc.draftList();
      if (mounted) setHasDrafts(drafts.length > 0);
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
        <Group justify="center" gap="xs">
          <Badge variant="filled" size="lg" color={mainColor}>
            Firedocs
          </Badge>
          <Text size="sm">Version beta 1.0</Text>
        </Group>

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
      </Container>
    </Center>
  );
}
