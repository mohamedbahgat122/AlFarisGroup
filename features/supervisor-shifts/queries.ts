import { createClient } from "@/lib/supabase/server";
import {
  SupervisorShift,
  SupervisorShiftAssignment,
  SupervisorOrganizationAssignment,
  SupervisorLeave,
} from "./types";

export async function getSupervisorsList() {
  const supabase = await createClient();
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "supervisor");

  if (profilesError) throw profilesError;


  const { data: orgAssignments, error: orgError } = await supabase
    .from("supervisor_organization_assignments")
    .select("*, organizations(id, name)")
    .is("end_date", null);

  if (orgError) throw orgError;

  const { data: shiftAssignments, error: shiftError } = await supabase
    .from("supervisor_shift_assignments")
    .select("*")
    .is("end_date", null);

  if (shiftError) throw shiftError;

  const { data: leaves, error: leavesError } = await supabase
    .from("supervisor_leaves")
    .select("*")
    .eq("status", "active");

  if (leavesError) throw leavesError;
  
  const { data: shifts, error: shiftsDefError } = await supabase
    .from("supervisor_shifts")
    .select("*");
    
  if (shiftsDefError) throw shiftsDefError;

  const { data: allOrganizations, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, code");
  
  if (orgsError) throw orgsError;

  const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })).toISOString().split('T')[0];

  const { data: weeklyOffs, error: weeklyOffsError } = await supabase
    .from("supervisor_weekly_off_assignments")
    .select("*")
    .lte("effective_from", todayStr)
    .or(`effective_to.is.null,effective_to.gte.${todayStr}`);

  if (weeklyOffsError) throw weeklyOffsError;

  // For work sessions, fetch today's sessions based on Riyadh time
  const { data: workSessions, error: workSessionsError } = await supabase
    .from("supervisor_work_sessions")
    .select("*")
    .eq("work_date", todayStr);

  if (workSessionsError) throw workSessionsError;

  return {
    supervisors: profiles,
    orgAssignments,
    shiftAssignments,
    leaves,
    shifts,
    allOrganizations,
    weeklyOffs,
    workSessions,
  };
}
