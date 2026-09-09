"""Foundation: RBAC + branch scope ke thua Node (Master §37)."""
from app.core.permissions import (
    can_admin_license,
    can_approve,
    filter_by_branch_scope,
    has_rank,
    map_node_role,
)


def test_role_map():
    assert map_node_role("Admin") == "ADMIN"
    assert map_node_role("HR") == "HR"
    assert map_node_role("Manager") == "BRANCH_MANAGER"
    assert map_node_role("Umbomilk") == "VIEWER"
    assert map_node_role("La") == "VIEWER"


def test_rank():
    assert has_rank("ADMIN", "HR") and has_rank("SUPER_ADMIN", "ADMIN")
    assert not has_rank("HR", "ADMIN") and not has_rank("VIEWER", "HR")


def test_branch_scope_manager_only():
    items = [{"branchId": "CN1"}, {"branchId": "CN2"}]
    assert len(filter_by_branch_scope(items, "ADMIN", [])) == 2
    assert len(filter_by_branch_scope(items, "HR", ["CN1"])) == 2  # HR xem full nhu Node
    got = filter_by_branch_scope(items, "BRANCH_MANAGER", ["CN2"])
    assert got == [{"branchId": "CN2"}]


def test_approval_gates():
    assert can_approve("HR") and can_approve("ADMIN") and not can_approve("VIEWER")
    assert can_admin_license("ADMIN") and not can_admin_license("HR")
