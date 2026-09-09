// services/vipRepository.js — Repository Layer cho staged Postgres migration (Master §39 Stage B).
//
// QUAN TRONG (PHASE 11):
// - File nay CHUA duoc require boi server.js -> zero runtime impact, zero regression.
// - Khi Stage B bat dau: require tu server.js va thay tung diem doc/ghi db.* bang
//   dual-read/dual-write an toan (doc Postgres truoc, fallback db.json; ghi ca hai).
// - Khong xoa db.json cho den khi Stage C verify xong. Khong big-bang rewrite.

function dualRead({ fromPostgres, fromJson, usePostgres }) {
  if (usePostgres) {
    try {
      const rows = fromPostgres();
      if (rows !== undefined && rows !== null) return { rows, source: 'POSTGRES' };
    } catch (e) {
      // fallback an toan ve JSON
    }
  }
  return { rows: fromJson(), source: 'JSON' };
}

async function dualWrite({ toPostgres, toJson, payload }) {
  const out = { postgres: false, json: false };
  try {
    await toPostgres(payload);
    out.postgres = true;
  } catch (e) {
    out.postgresError = String((e && e.message) || e).slice(0, 200);
  }
  try {
    toJson(payload);
    out.json = true;
  } catch (e) {
    out.jsonError = String((e && e.message) || e).slice(0, 200);
  }
  if (!out.postgres && !out.json) throw new Error('dualWrite: ca hai backend deu loi');
  return out;
}

// Concurrency entities uu tien Stage B: interview appointments, test
// appointments, off locks, job queue, license/session, audit index.
const STAGE_B_ENTITIES = [
  'interview_appointments',
  'test_appointments',
  'off_locks',
  'job_queue',
  'license_session',
  'audit_index',
];

module.exports = { dualRead, dualWrite, STAGE_B_ENTITIES };
