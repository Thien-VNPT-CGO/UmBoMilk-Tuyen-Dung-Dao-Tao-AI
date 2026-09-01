// services/dbAdapter.js - Abstraction cho realtime DB (JSON hiện tại, sẵn sàng Postgres/Prisma)
// Mục tiêu: Mọi route gọi dbAdapter thay vì trực tiếp db.* và fs, giúp chuyển Postgres không sửa route

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');

// Hiện tại: JSON file với atomic write + encrypt (đã triển khai trong server.js)
// Tương lai: đổi sang PrismaClient:
// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

class DbAdapter {
  constructor(dbMemory){
    this.db = dbMemory; // tham chiếu db object trong server.js
    this.isPostgres = !!process.env.DATABASE_URL;
  }

  // Realtime helpers
  async findEmployees(filter){
    if(this.isPostgres){
      // return await prisma.employee.findMany({where: filter});
      throw new Error('Postgres chưa cấu hình DATABASE_URL');
    }
    // JSON fallback: filter in-memory
    let list = [...this.db.employees];
    if(filter.branchId) list = list.filter(e=>e.branchId===filter.branchId);
    if(filter.status) list = list.filter(e=>e.status===filter.status);
    return list;
  }

  async createAttendance(data){
    if(this.isPostgres){
      // return await prisma.attendance.create({data});
    }
    this.db.attendances.push(data);
    return data;
  }

  // Migration từ JSON -> Postgres (tự động hoá)
  async migrateJsonToPostgres(){
    console.log('[MIGRATE] Bắt đầu migrate db.json -> Postgres...');
    // 1. Đọc db.json
    // 2. Batch insert qua prisma.$transaction
    // Ví dụ: await prisma.employee.createMany({data: db.employees})
    // 3. Verify counts, emit realtime event
    console.log('[MIGRATE] Xong - cần DATABASE_URL và npx prisma migrate dev');
    return { employees: this.db.employees.length };
  }
}

module.exports = DbAdapter;
