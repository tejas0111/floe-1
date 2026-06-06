import { Route, Routes, matchPath, useLocation, type Location } from "react-router";
import Layout from "@/components/Layout";
import Overview from "@/pages/Overview";
import Uploads from "@/pages/Uploads";
import UploadDetail from "@/pages/UploadDetail";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";

export default function App() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const isUploadDetail = Boolean(matchPath({ path: "/uploads/:fileId", end: true }, location.pathname));
  const backgroundLocation =
    state?.backgroundLocation ?? (isUploadDetail ? ({ ...location, pathname: "/uploads" } as Location) : undefined);

  return (
    <Layout>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/" element={<Overview />} />
        <Route path="/uploads" element={<Uploads />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <Routes>
        <Route path="/uploads/:fileId" element={<UploadDetail />} />
      </Routes>
    </Layout>
  );
}
