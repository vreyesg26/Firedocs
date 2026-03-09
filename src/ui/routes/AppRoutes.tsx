import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import Layout from "../App";
import StepsPage from "../pages/StepsPage";
import HomePage from "../pages/HomePage";
import TemplatesPage from "../pages/TemplatesPage";
import DraftsPage from "../pages/DraftsPage";
import ManualPreviewPage from "../pages/ManualPreviewPage";

export default function AppRoutes() {
  const Router =
    typeof window !== "undefined" && window.location.protocol === "file:"
      ? HashRouter
      : BrowserRouter;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<HomePage />} />

        <Route element={<Layout />}>
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/import" element={<StepsPage />} />
          <Route path="/editor" element={<StepsPage />} />
          <Route path="/preview" element={<ManualPreviewPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
