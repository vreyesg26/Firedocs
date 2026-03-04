import { AppShell } from "@mantine/core";
import { Outlet } from "react-router-dom";

const App = () => {

  return (
    <AppShell
      padding="md"
    >
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};

export default App;
