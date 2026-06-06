import { useLocation, useNavigate, useParams } from "react-router";
import type { FileRecord } from "@/types";
import FileDetailDrawer from "@/components/uploads/FileDetailDrawer";

interface UploadDetailRouteState {
  returnTo?: string;
  file?: FileRecord | null;
}

export default function UploadDetail() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as UploadDetailRouteState | null;
  const returnTo = state?.returnTo ?? "/uploads";

  if (!fileId) return null;

  return (
    <FileDetailDrawer
      open
      fileId={fileId}
      file={state?.file ?? null}
      onOpenChange={(open) => {
        if (!open) {
          navigate(returnTo, { replace: true });
        }
      }}
    />
  );
}
