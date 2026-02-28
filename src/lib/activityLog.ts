import { supabase } from "@/integrations/supabase/client";

export type ActivityActionType =
  | "status_change"
  | "konstrukter_change"
  | "datum_smluvni_change"
  | "project_created"
  | "project_deleted"
  | "project_restored"
  | "document_uploaded"
  | "document_deleted"
  | "etapa_created"
  | "etapa_deleted"
  | "etapa_status_change"
  | "etapa_konstrukter_change"
  | "etapa_datum_smluvni_change"
  | "etapa_document_uploaded"
  | "etapa_document_deleted";

interface LogParams {
  projectId: string;
  actionType: ActivityActionType;
  oldValue?: string | null;
  newValue?: string | null;
  detail?: string | null;
}

export async function logActivity(params: LogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase.from("project_activity_log") as any).insert({
      project_id: params.projectId,
      user_id: user.id,
      user_email: user.email ?? "",
      action_type: params.actionType,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      detail: params.detail ?? null,
    });
  } catch (e) {
    console.error("Activity log error:", e);
  }
}
