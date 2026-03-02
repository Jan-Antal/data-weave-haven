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
  | "stage_created"
  | "stage_deleted"
  | "stage_status_change"
  | "stage_konstrukter_change"
  | "stage_datum_smluvni_change"
  | "stage_document_uploaded"
  | "stage_document_deleted"
  | "project_id_change";

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

    await (supabase.from("data_log") as any).insert({
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
