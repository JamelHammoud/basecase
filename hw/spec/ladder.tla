---------------------------- MODULE ladder ----------------------------
EXTENDS Naturals, Sequences, FiniteSets

Modes == <<"look", "set_up", "test", "rehearse", "first_run", "policy", "longer_runs">>
ModeSet == {Modes[i] : i \in 1..Len(Modes)}
Rung(m) == CHOOSE i \in 1..Len(Modes) : Modes[i] = m
Observed == {"bus_checked", "calibration_present", "firmware_known", "policy_present"}
Earned == {"tested", "rehearsed", "first_run_done", "policy_run_done"}
Facts == Observed \cup Earned
Changes == {"calibration", "policy", "firmware"}

Requires(m) ==
    CASE m = "look" -> {}
      [] m = "set_up" -> {"bus_checked"}
      [] m = "test" -> {"bus_checked", "calibration_present", "firmware_known"}
      [] m = "rehearse" -> {"bus_checked", "calibration_present", "firmware_known", "tested", "policy_present"}
      [] m = "first_run" -> {"bus_checked", "calibration_present", "firmware_known", "tested", "policy_present", "rehearsed"}
      [] m = "policy" -> {"bus_checked", "calibration_present", "firmware_known", "tested", "policy_present", "rehearsed", "first_run_done"}
      [] m = "longer_runs" -> {"bus_checked", "calibration_present", "firmware_known", "tested", "policy_present", "rehearsed", "first_run_done", "policy_run_done"}

Clears(c) ==
    CASE c = "calibration" -> {"tested", "rehearsed", "first_run_done", "policy_run_done"}
      [] c = "firmware" -> {"tested", "rehearsed", "first_run_done", "policy_run_done"}
      [] c = "policy" -> {"rehearsed", "first_run_done", "policy_run_done"}

Earns(m) ==
    CASE m = "test" -> {"tested"}
      [] m = "rehearse" -> {"rehearsed"}
      [] m = "first_run" -> {"first_run_done"}
      [] m = "policy" -> {"policy_run_done"}
      [] OTHER -> {}

VARIABLES mode, facts, latched
vars == <<mode, facts, latched>>

Init == mode = "look" /\ facts = {} /\ latched = FALSE

Enter(target) ==
    \/ /\ target = "look"
       /\ mode' = "look"
       /\ UNCHANGED <<facts, latched>>
    \/ /\ target # "look"
       /\ ~latched
       /\ Rung(target) >= Rung(mode)
       /\ Rung(target) <= Rung(mode) + 1
       /\ Requires(target) \subseteq facts
       /\ mode' = target
       /\ UNCHANGED <<facts, latched>>

Learn(f, v) ==
    /\ facts' = IF v THEN facts \cup {f} ELSE facts \ {f}
    /\ UNCHANGED <<mode, latched>>

Change(c) ==
    /\ facts' = facts \ Clears(c)
    /\ mode' = IF Rung(mode) > Rung("first_run") THEN "first_run" ELSE mode
    /\ UNCHANGED latched

Complete(m) ==
    /\ m = mode
    /\ ~latched
    /\ facts' = facts \cup Earns(m)
    /\ UNCHANGED <<mode, latched>>

Fault ==
    /\ latched' = TRUE
    /\ UNCHANGED <<mode, facts>>

ClearFault ==
    /\ mode = "look"
    /\ latched' = FALSE
    /\ UNCHANGED <<mode, facts>>

Next ==
    \/ \E m \in ModeSet : Enter(m) \/ Complete(m)
    \/ \E f \in Observed, v \in BOOLEAN : Learn(f, v)
    \/ \E c \in Changes : Change(c)
    \/ Fault
    \/ ClearFault

Spec == Init /\ [][Next]_vars

EvidenceAboveFirstRun == Rung(mode) > Rung("first_run") => "first_run_done" \in facts

LongerRunsNeedPolicyRun == mode = "longer_runs" => "policy_run_done" \in facts

StepsUpAreEarned ==
    [][Rung(mode') > Rung(mode) =>
        /\ Requires(mode') \subseteq facts
        /\ Rung(mode') = Rung(mode) + 1
        /\ ~latched]_vars

FaultsClearOnlyInLook == [][(latched /\ ~latched') => mode = "look"]_vars

LookIsAlwaysReachable == [](ENABLED Enter("look"))

=============================================================================
