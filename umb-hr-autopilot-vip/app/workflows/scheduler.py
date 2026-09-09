"""Smart Weekly Scheduler — Google OR-Tools CP-SAT (Master §21).

KHONG dung LLM giai constraint. Hard constraints bang CP-SAT, soft bang
objective co trong so. Flow: Generate Draft -> Validate -> Preview ->
HR Approve -> Write Node Core -> Socket -> Sheet (approve o API layer).
"""
from __future__ import annotations

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def schedule_week(employees: list[dict], staffing: dict[str, dict[str, int]],
                  off: set[tuple[str, str]] | None = None,
                  fixed_shift: dict[str, str] | None = None,
                  time_limit_sec: float = 10.0) -> dict:
    """employees: [{id, branchId, shifts:[...]}]. staffing: {day: {shift: need}}.
    off: {(emp_id, day)}. fixed_shift: {emp_id: shift} (uu tien ca co dinh).
    Tra ve {ok, assignments: {emp_id: {day: shift|"OFF"}}, stats}."""
    from ortools.sat.python import cp_model

    off = off or {}
    fixed_shift = fixed_shift or {}
    model = cp_model.CpModel()
    emp_ids = [e["id"] for e in employees]
    emp = {e["id"]: e for e in employees}
    shifts = sorted({s for need in staffing.values() for s in need})

    x: dict[tuple[str, str, str], object] = {}
    for eid in emp_ids:
        for d in DAYS:
            for s in shifts:
                x[(eid, d, s)] = model.new_bool_var(f"x_{eid}_{d}_{s}")

    # Hard: approved OFF -> khong xep.
    for (eid, d) in off:
        for s in shifts:
            if (eid, d, s) in x:
                model.add(x[(eid, d, s)] == 0)

    # Hard: moi NV moi ngay toi da 1 ca (khong duplicate employee/day).
    for eid in emp_ids:
        for d in DAYS:
            model.add(sum(x[(eid, d, s)] for s in shifts) <= 1)

    # Hard: staffing requirement (rut gon: need chung, chi xep shifts NV lam duoc).
    for d in DAYS:
        for s, need in staffing.get(d, {}).items():
            eligible = [eid for eid in emp_ids if s in emp[eid].get("shifts", shifts)]
            model.add(sum(x[(eid, d, s)] for eid in eligible) >= min(need, len(eligible)))

    # Soft: fairness — giam chenh lech so ca; uu tien ca co dinh.
    loads = {}
    for eid in emp_ids:
        loads[eid] = model.new_int_var(0, 7, f"load_{eid}")
        model.add(loads[eid] == sum(x[(eid, d, s)] for d in DAYS for s in shifts))
    max_load = model.new_int_var(0, 7, "max_load")
    min_load = model.new_int_var(0, 7, "min_load")
    for eid in emp_ids:
        model.add(loads[eid] <= max_load)
        model.add(loads[eid] >= min_load)
    fixed_bonus = []
    for eid, s in fixed_shift.items():
        for d in DAYS:
            if (eid, d, s) in x:
                fixed_bonus.append(x[(eid, d, s)])
    model.minimize(10 * (max_load - min_load) - sum(fixed_bonus))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"ok": False, "reason": "NO_FEASIBLE_SOLUTION"}

    assignments: dict[str, dict[str, str]] = {}
    for eid in emp_ids:
        assignments[eid] = {}
        for d in DAYS:
            pick = "OFF"
            for s in shifts:
                if solver.value(x[(eid, d, s)]) == 1:
                    pick = s
                    break
            assignments[eid][d] = pick
    loads_val = {eid: sum(1 for d in DAYS if assignments[eid][d] != "OFF") for eid in emp_ids}
    return {"ok": True, "assignments": assignments,
            "stats": {"max_load": max(loads_val.values() or [0]),
                      "min_load": min(loads_val.values() or [0]),
                      "loads": loads_val}}
