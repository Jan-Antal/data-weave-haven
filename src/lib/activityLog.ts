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
  | "project_id_change"
  | "document_moved"
  | "item_scheduled"
  | "item_moved"
  | "item_completed"
  | "item_paused"
  | "item_cancelled"
  | "item_returned_to_inbox"
  | "item_split"
  | "pm_change"
  | "kalkulant_change"
  | "prodejni_cena_change"
  | "forecast_committed"
  | "item_hotovo"
  | "item_qc_confirmed"
  | "item_expedice"
  | "item_moved_next_week"
  | "item_paused_vyroba"
  | "vyroba_log_saved"
  | "vyroba_no_activity"
  | "defect_reported"
  | "defect_resolved"
  | "phase_changed";

interface LogParams {
  projectId: string;
  actionType: ActivityActionType;
  oldValue?: string | null;
  newValue?: string | null;
  detail?: string | null;
  stageId?: string | null;
}

const TEST_EMAILS = ["alfred@ami-test.cz"];

export async function logActivity(params: LogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isTestUser = TEST_EMAILS.includes(user.email ?? "");
    const detailPrefix = isTestUser ? "[TEST] " : "";

    await (supabase.from("data_log") as any).insert({
      project_id: params.projectId,
      user_id: user.id,
      user_email: user.email ?? "",
      action_type: params.actionType,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      detail: `${detailPrefix}${params.detail ?? ""}` || null,
      stage_id: params.stageId ?? null,
    });
  } catch (e) {
    console.error("Activity log error:", e);
  }
}
